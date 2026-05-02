import re

import httpx
from dataclasses import dataclass

from backend.config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class TopicSummaries:
    technical: str
    general: str
    prediction: str


async def generate_summaries(
    topic_label: str,
    abstracts: list[str],
) -> TopicSummaries:
    """Send a batch of abstracts to OpenRouter and get back three summary variants."""

    abstracts_text = "\n\n---\n\n".join(abstracts[:30])

    prompt = f"""You are a research analyst summarizing a cluster of academic papers from arXiv.

Topic: {topic_label}

Below are recent paper abstracts in this topic cluster:

{abstracts_text}

Provide three summaries of this research topic. Return your response in EXACTLY this format with these three headers:

## Technical Summary
Write 2-3 sentences for a technical/research audience. Use specific terminology, mention key methods or architectures, and reference notable findings.

## General Summary
Write 2-3 sentences for a general audience. Explain what this research area is about and why it matters, avoiding jargon.

## Prediction
Write 2-3 sentences predicting where this research area is heading in the near term based on the trends in these papers. Note: this is an AI-generated prediction and may not be accurate."""

    response = await _call_openrouter(prompt)
    return _parse_summaries(response)


async def generate_query_answer(
    question: str,
    topic_label: str,
    abstracts: list[dict],
) -> str:
    """Answer a natural language question using recent abstracts as context."""

    context = "\n\n".join(
        f"[{a['arxiv_id']}] {a['title']}\n{a['abstract']}"
        for a in abstracts[:30]
    )

    prompt = f"""You are a research assistant. A user asked a question about AI/ML research.
Answer based ONLY on the provided paper abstracts. Cite papers using their arXiv IDs.

User question: {question}

Matched topic: {topic_label}

Recent papers in this topic:

{context}

Provide a clear, concise answer (3-5 sentences) with citations in [arXiv:XXXX.XXXXX] format."""

    return await _call_openrouter(prompt)


async def generate_topic_label(
    terms: list[str],
    sample_titles: list[str],
    fallback: str,
) -> str:
    """Generate a short, distinctive label for a topic cluster.

    Returns the cleaned LLM label, or `fallback` if the call fails, no API
    key is configured, or the response is empty/oversized.
    """
    if not settings.openrouter_api_key:
        return fallback

    terms_text = ", ".join(terms[:10]) if terms else "(none)"
    titles_text = "\n".join(f"- {t}" for t in sample_titles[:8] if t) or "(none)"

    prompt = f"""You are an expert AI research librarian naming a cluster of arXiv papers.

Generate a SHORT, DISTINCTIVE topic label (3 to 6 words) for the cluster below.

Rules:
- Use specific technical terminology that distinguishes this cluster from other AI/ML topics
- Avoid generic filler: "model", "method", "approach", "framework", "data", "deep learning", "neural network", "task"
- Use Title Case (e.g., "Diffusion Model Distillation")
- No quotes, no trailing period, no explanation

Top representative terms (from c-TF-IDF):
{terms_text}

Sample paper titles from this cluster:
{titles_text}

Output the label and nothing else."""

    try:
        # temperature=0 → near-deterministic labels run-to-run, so the same
        # cluster gets the same name and slugs stay stable.
        response = await _call_openrouter(prompt, temperature=0.0)
    except (httpx.HTTPError, KeyError, ValueError) as e:
        # HTTPError covers timeouts, network errors, non-2xx responses.
        # KeyError/ValueError cover malformed JSON bodies returned with HTTP 200.
        print(f"  topic label generation failed: {type(e).__name__}: {e}; using fallback")
        return fallback

    label = _clean_label(response)
    # prompt asks for 3-6 words. Reject longer outputs — those are usually the
    # model echoing a paper title instead of producing a topic name.
    word_count = len(label.split())
    if not label or word_count < 2 or word_count > 6:
        print(f"  topic label rejected ({word_count} words): {label!r}; using fallback")
        return fallback
    return label


_HYPHEN_TRANSLATION = str.maketrans({
    "‐": "-",  # hyphen
    "‑": "-",  # non-breaking hyphen
    "‒": "-",  # figure dash
    "–": "-",  # en dash
    "—": "-",  # em dash
    "−": "-",  # minus sign
})


def _clean_label(raw: str) -> str:
    """Best-effort cleanup of a model-generated topic label."""
    lines = [l.strip() for l in raw.strip().split("\n") if l.strip()]
    if not lines:
        return ""
    label = lines[0]
    for prefix in ("Label:", "Topic:", "Title:", "Name:", "Cluster:"):
        if label.lower().startswith(prefix.lower()):
            label = label[len(prefix):].strip()
            break
    # Normalise Unicode dashes to ASCII so two LLM-generated labels that
    # differ only in dash style produce the same slug, instead of creating
    # a duplicate topic row that orphans the previous one.
    label = label.translate(_HYPHEN_TRANSLATION)
    return label.strip('"\'`*').rstrip(".,;:!").strip()


async def _call_openrouter(prompt: str, temperature: float | None = None) -> str:
    """Make a chat completion request to the OpenRouter API."""

    payload: dict = {
        "model": settings.openrouter_model,
        "messages": [{"role": "user", "content": prompt}],
    }
    if temperature is not None:
        payload["temperature"] = temperature

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        # Free-tier providers occasionally return HTTP 200 with empty content
        # (rate-limit/provider-failover). Treat as a hard failure so callers'
        # except blocks trigger instead of silently writing placeholder text.
        if not content or not content.strip():
            raise ValueError("OpenRouter returned empty content")
        return content


_HEADER_RE = re.compile(
    r"^(?:#{2,}\s*|\*+\s*)?"
    r"(technical(?:\s+summary)?|general(?:\s+summary)?|prediction)"
    r"\s*(?:\*+|:)?\s*$",
    re.IGNORECASE,
)


def _parse_summaries(text: str) -> TopicSummaries:
    """Parse the LLM response into three summary sections.

    Tolerates several markdown header styles the model occasionally uses
    instead of the requested `## Header`: `**Header**`, `### Header`,
    `Header:`, etc.
    """

    sections: dict[str, list[str]] = {}
    current: str | None = None

    for line in text.splitlines():
        m = _HEADER_RE.match(line.strip())
        if m:
            name = m.group(1).lower()
            if "technical" in name:
                current = "technical"
            elif "general" in name:
                current = "general"
            else:
                current = "prediction"
            sections.setdefault(current, [])
        elif current is not None:
            sections.setdefault(current, []).append(line)

    technical = "\n".join(sections.get("technical", [])).strip()
    general = "\n".join(sections.get("general", [])).strip()
    prediction = "\n".join(sections.get("prediction", [])).strip()

    # If none of the expected headers parsed, the response is unusable.
    # Raise so the caller's except block skips the DB write and preserves
    # the previous summary instead of clobbering it with placeholder text.
    if not technical and not general and not prediction:
        raise ValueError("LLM response missing all three summary sections")

    return TopicSummaries(
        technical=technical or "Summary not available.",
        general=general or "Summary not available.",
        prediction=prediction or "Prediction not available. Note: predictions are AI-generated and may not be accurate.",
    )
