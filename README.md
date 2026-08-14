# AIBunkenChousa frontend

The API settings screen supports Anthropic and OpenAI-compatible LLM servers.
For Ollama use `http://localhost:11434/v1` with an installed model such as
`qwen3:8b`. LM Studio and vLLM use their corresponding `/v1` base URL. Local
API keys are optional; connection details stay in browser local storage.

OpenAI-compatible models must support Chat Completions structured output using
`response_format: {type: "json_schema"}`. Local providers run synchronously and
are displayed as unpriced.

```bash
npm install
npm run dev
```
