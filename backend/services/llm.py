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


async def _call_openrouter(prompt: str) -> str:
    """Make a chat completion request to the OpenRouter API."""

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.openrouter_model,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


def _parse_summaries(text: str) -> TopicSummaries:
    """Parse the LLM response into three summary sections."""

    technical = ""
    general = ""
    prediction = ""

    sections = text.split("## ")
    for section in sections:
        lower = section.lower()
        content = section.split("\n", 1)[1].strip() if "\n" in section else ""

        if lower.startswith("technical"):
            technical = content
        elif lower.startswith("general"):
            general = content
        elif lower.startswith("prediction"):
            prediction = content

    return TopicSummaries(
        technical=technical or "Summary not available.",
        general=general or "Summary not available.",
        prediction=prediction or "Prediction not available. Note: predictions are AI-generated and may not be accurate.",
    )
