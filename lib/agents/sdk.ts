let lastAgentSdkError: string | null = null;

function getErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function runWithAgentSdk(systemPrompt: string, input: string): Promise<string | null> {
  const hasAzure =
    Boolean(process.env.AZURE_OPENAI_API_KEY) &&
    Boolean(process.env.AZURE_OPENAI_ENDPOINT) &&
    Boolean(process.env.AZURE_OPENAI_DEPLOYMENT);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (!hasAzure && !hasOpenAI) {
    lastAgentSdkError = "Missing credentials: set AZURE_OPENAI_* or OPENAI_API_KEY.";
    return null;
  }

  try {
    type AgentModule = {
      Agent?: new (config: { name: string; instructions: string; model: unknown }) => unknown;
      run?: (agent: unknown, inputText: string) => Promise<{ finalOutput?: string; outputText?: string }>;
    };
    type AgentsOpenAIModule = {
      OpenAIResponsesModel?: new (client: unknown, model: string) => unknown;
    };
    type OpenAISdkModule = {
      default?: new (config: { apiKey: string }) => unknown;
      AzureOpenAI?: new (config: {
        apiKey: string;
        apiVersion: string;
        endpoint: string;
        deployment: string;
      }) => unknown;
    };

    const agents = (await import("@openai/agents")) as AgentModule;
    const agentsOpenAI = (await import("@openai/agents-openai")) as AgentsOpenAIModule;
    const openaiSdk = (await import("openai")) as OpenAISdkModule;

    const AgentCtor = agents.Agent;
    const run = agents.run;
    const OpenAIResponsesModel = agentsOpenAI.OpenAIResponsesModel;

    if (!AgentCtor || !run || !OpenAIResponsesModel) {
      lastAgentSdkError = "OpenAI Agents SDK modules could not be initialized.";
      return null;
    }

    let client: unknown;
    let modelName: string;

    if (hasAzure) {
      const AzureOpenAI = openaiSdk.AzureOpenAI;
      if (!AzureOpenAI) {
        lastAgentSdkError = "OpenAI Azure SDK class was not found.";
        return null;
      }

      client = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY!,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2025-03-01-preview",
        endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
      });
      modelName = process.env.AZURE_OPENAI_DEPLOYMENT!;
    } else {
      const OpenAI = openaiSdk.default;
      if (!OpenAI) {
        lastAgentSdkError = "OpenAI SDK default client was not found.";
        return null;
      }

      client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      });
      modelName = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    }

    const model = new OpenAIResponsesModel(client, modelName);

    const agent = new AgentCtor({
      name: "O2C Agent",
      instructions: systemPrompt,
      model,
    });

    const result = await run(agent, input);
    lastAgentSdkError = null;
    return String(result?.finalOutput ?? result?.outputText ?? "");
  } catch (err) {
    lastAgentSdkError = getErrorMessage(err);
    return null;
  }
}

export async function runWithAgentSdkStrict(systemPrompt: string, input: string): Promise<string> {
  const output = await runWithAgentSdk(systemPrompt, input);
  if (!output) {
    const reason = lastAgentSdkError ? ` Reason: ${lastAgentSdkError}` : "";
    throw new Error(
      `Order Capture requires a configured model via Azure OpenAI or OpenAI API key. Set AZURE_OPENAI_* or OPENAI_API_KEY.${reason}`,
    );
  }
  return output;
}
