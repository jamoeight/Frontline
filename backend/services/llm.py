import json
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
) -> TopicSummaries | None:
    """Send a batch of abstracts to OpenRouter and get back three summary variants.

    Returns None on any failure (network error, empty/malformed response,
    missing API key). Callers should treat None as "skip the DB write" so a
    transient OpenRouter failure doesn't clobber a good existing summary
    with placeholder text.
    """
    if not settings.openrouter_api_key:
        print(f"  summary skipped: no OPENROUTER_API_KEY")
        return None

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

    try:
        response = await _call_openrouter(prompt)
        return _parse_summaries(response)
    except (httpx.HTTPError, KeyError, ValueError) as e:
        # HTTPError: timeouts, network errors, non-2xx responses.
        # KeyError: malformed JSON body (missing "choices" / "content").
        # ValueError: empty content, or _parse_summaries couldn't find all
        # three sections.
        print(f"  summary generation failed: {type(e).__name__}: {e}; preserving existing summary")
        return None


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


async def generate_state_of_state(
    topics: list[dict],
    candidate_pairs: list[dict],
    prior_briefing: dict | None,
) -> dict:
    """Synthesize a cross-cluster editorial briefing from the current corpus.

    `topics` is a list of dicts with: slug, label, paper_count, week_papers,
    growth_rate, acceleration, summary_general, representative_terms.
    `candidate_pairs` is a list of dicts with: a_slug, a_label, b_slug, b_label,
    similarity, similarity_delta — pre-computed from embeddings, the LLM ranks
    and explains them rather than fabricating connections.
    `prior_briefing`, if present, contains the previous run's `predictions` and
    a `now_snapshot` (this week's topics) so the model can grade those
    predictions as held / partial / missed with cited evidence.

    Returns the parsed `sections` dict. Raises ValueError on parse failure;
    callers should abort writing rather than store malformed output.
    """

    topics_md = "\n".join(
        f"| {t['slug']} | {t['label']} | {t['paper_count']} | {t.get('week_papers', 0)} | "
        f"{_fmt_pct(t.get('growth_rate'))} | {_fmt_pct(t.get('acceleration'))} | "
        f"{', '.join((t.get('representative_terms') or [])[:6])} | "
        f"{(t.get('summary_general') or '').replace('|', '/').replace(chr(10), ' ')[:240]} |"
        for t in topics
    )

    pairs_md = "\n".join(
        f"- {p['a_label']} ⇄ {p['b_label']} "
        f"(similarity {p['similarity']:.3f}, Δ {p.get('similarity_delta', 0.0):+.3f})"
        for p in candidate_pairs
    ) or "- (none detected this cycle)"

    if prior_briefing and prior_briefing.get("predictions"):
        prior_block = (
            "PRIOR PREDICTIONS (grade each as held / partial / missed using THIS WEEK'S table above):\n"
            + "\n".join(
                f"{i+1}. {p.get('claim', '')} "
                f"[testable_by: {p.get('testable_by', 'unspecified')}; "
                f"slugs: {', '.join(p.get('slugs', []))}]"
                for i, p in enumerate(prior_briefing["predictions"])
            )
        )
    else:
        prior_block = "PRIOR PREDICTIONS: (none — this is the first briefing; omit `calibration` from output.)"

    prompt = f"""You are the editor of "The Briefing," a weekly synthesis of AI research published alongside the Frontline arXiv tracker. Your readers are working AI researchers; they want signal, not flattery.

CURRENT TOPICS (top by recent activity):

| slug | label | total | this week | growth | accel | top terms | one-line summary |
|---|---|---|---|---|---|---|---|
{topics_md}

CANDIDATE CROSS-CLUSTER CONVERGENCES (computed numerically from embedding centroids — pick the ones with a real, explainable shared signal; you may discard pairs that are spurious):
{pairs_md}

{prior_block}

Write the briefing as a single JSON object with EXACTLY these keys:

{{
  "lede": "3-4 sentence executive paragraph naming what is actually happening across AI research this week. Specific, not generic.",
  "big_movements": [
    {{"title": "italic-worthy 4-8 word headline", "narrative": "2-3 sentences explaining the cross-cluster movement, naming techniques and why it matters", "topic_slugs": ["slug1", "slug2"]}}
  ],
  "emerging": [{{"slug": "slug", "why": "one sentence — what's new or accelerating"}}],
  "decelerating": [{{"slug": "slug", "why": "one sentence — what's cooling and why"}}],
  "cross_pollinations": [
    {{"topic_a_slug": "slug", "topic_b_slug": "slug", "shared_signal": "the actual technique or question both clusters are converging on"}}
  ],
  "researcher_dispatch": [
    {{"if_you_work_on": "concise area name", "also_watch_slugs": ["slug"], "reason": "one sentence — why this is worth a working researcher's time"}}
  ],
  "open_questions": ["concrete unresolved questions surfaced by gaps in the corpus"],
  "predictions": [
    {{"claim": "falsifiable claim about the next 1-2 weeks (e.g., 'paper count in <slug> will exceed X' or 'we expect convergence between A and B')", "testable_by": "next briefing", "slugs": ["slug"]}}
  ],
  "calibration": {{
    "graded": [
      {{"claim": "verbatim prior claim", "verdict": "held|partial|missed", "evidence": "one sentence citing this week's data"}}
    ]
  }}
}}

Rules:
- 2 to 4 big_movements, 3 to 6 emerging, 3 to 6 decelerating, up to 4 cross_pollinations, 3 to 5 researcher_dispatch entries, 3 to 5 open_questions, 3 to 5 predictions.
- Only use slugs that appear in the table above. Never invent slugs.
- Be specific. "Models are getting bigger" is not a movement. "Sub-1B reasoning models matching 7B baselines via process-supervised RL" is.
- Predictions must be falsifiable from the next briefing's table.
- If there are no PRIOR PREDICTIONS, omit the `calibration` key entirely.
- Output JSON only. No prose before or after. No markdown code fences.
"""

    raw = await _call_openrouter(prompt, temperature=0.2)
    return _parse_json_object(raw)


def _fmt_pct(v) -> str:
    if v is None:
        return "—"
    try:
        return f"{float(v) * 100:+.0f}%"
    except (TypeError, ValueError):
        return "—"


def _parse_json_object(text: str) -> dict:
    """Pull the first balanced JSON object out of a response and parse it.

    Models sometimes wrap output in ```json fences or prose despite instructions;
    strip those before parsing. Raises ValueError if no object is found or it
    fails to parse — caller should treat that as a generation failure.
    """
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)

    start = stripped.find("{")
    if start == -1:
        raise ValueError("no JSON object in LLM response")

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(stripped)):
        ch = stripped[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(stripped[start : i + 1])

    raise ValueError("unterminated JSON object in LLM response")


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

    # Require all three sections. A partial response shouldn't be allowed to
    # overwrite good existing text in any of the three columns with
    # "Summary not available." placeholders — fail the whole call instead
    # and let the caller preserve the previous summary.
    missing = [name for name, val in
               (("technical", technical), ("general", general), ("prediction", prediction))
               if not val]
    if missing:
        raise ValueError(f"LLM response missing sections: {', '.join(missing)}")

    return TopicSummaries(technical=technical, general=general, prediction=prediction)
