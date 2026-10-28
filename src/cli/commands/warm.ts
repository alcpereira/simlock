import { commandArgs, subcommandOrUsage, UsageError, withHelpHint, writeResult } from "../args.js";
import { connectDaemonClient } from "../connect.js";
import type { CommandContext } from "../tree.js";

const WARM_USAGE =
  "Usage: simlock warm forget <ios|android> <model> [<os>] [--mode <slim|full>] [--image-tag <tag>] [--json]\n";

async function run(argv: readonly string[], context: CommandContext): Promise<number> {
  const { environment, token } = context;
  const parsed = subcommandOrUsage(argv, context.path, environment.stdout, WARM_USAGE);
  if (parsed === 0) return 0;
  if (parsed.command !== "forget") {
    throw new UsageError(withHelpHint(`Unknown warm command: ${parsed.command}`));
  }
  const values = commandArgs(parsed.flagArgs, {
    help: { type: "boolean", short: "h" },
    "image-tag": { type: "string" },
    json: { type: "boolean" },
    mode: { type: "string" },
  });
  if (values.help) {
    environment.stdout.write(WARM_USAGE);
    return 0;
  }
  const [platform, model, osVersion, ...extra] = values.positionals;
  if (platform !== "ios" && platform !== "android") {
    throw new UsageError(withHelpHint("warm forget needs a platform first: ios or android"));
  }
  if (model === undefined || model === "" || extra.length > 0) {
    throw new UsageError(withHelpHint("warm forget takes <platform> <model> and an optional <os>"));
  }
  const mode = values.mode;
  if (mode !== undefined && mode !== "slim" && mode !== "full") {
    throw new UsageError(withHelpHint("--mode is slim or full"));
  }
  const imageTag = values["image-tag"];
  const client = await connectDaemonClient(environment, token);
  try {
    const result = await client.forgetWarmKind({
      model,
      platform,
      ...(osVersion === undefined ? {} : { osVersion }),
      ...(mode === undefined ? {} : { mode }),
      ...(typeof imageTag === "string" ? { imageTag } : {}),
    });
    if (values.json) writeResult((value) => environment.stdout.write(value), result);
    else environment.stdout.write(describe(result.forgotten, `${platform} ${model}`));
    return 0;
  } finally {
    await client.close();
  }
}

function describe(
  forgotten: readonly {
    readonly platform: string;
    readonly model: string;
    readonly osVersion: string;
    readonly mode: string;
    readonly imageTag?: string | undefined;
  }[],
  asked: string,
): string {
  if (forgotten.length === 0) return `The warm pool has learned no kind of ${asked}.\n`;
  const lines = forgotten.map(
    (kind) =>
      `Forgot ${kind.platform} ${kind.model} ${kind.osVersion} (${kind.mode}${kind.imageTag === undefined ? "" : `, ${kind.imageTag}`}).\n`,
  );
  return `${lines.join("")}Its idle devices are no longer kept warm: the idle rules shut them down and delete them.\n`;
}

export { run };
