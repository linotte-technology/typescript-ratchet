import type { TypescriptInput, ReducedDiagnostics } from "./typecheck.worker";
import type { TsMorphInput, TsMorphOutput } from "./ts-morph.worker";
import ts from "typescript";
import { loadingAnimation, runWorker } from "./utils";
import * as path from "node:path";
import { run } from "jscodeshift/src/Runner";
import inquirer from "inquirer";

const typescriptCodemod = async (): Promise<void> => {
  const [setupOk, setupFail] = loadingAnimation(() => "Setup Project");
  const configPath = ts.findConfigFile(
    process.cwd(),
    (path) => ts.sys.fileExists(path),
    "tsconfig.json",
  );
  if (!configPath) {
    setupFail("Could not find a valid 'tsconfig.json'.");
    throw null;
  }
  const configFile = ts.readConfigFile(
    configPath,
    (path: string, encoding?: string) => ts.sys.readFile(path, encoding),
  );
  if (configFile.error) {
    setupFail(
      `Error reading tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")}`,
    );
    throw null;
  }
  let parsedConfig: ts.ParsedCommandLine;
  try {
    parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
    );
    parsedConfig.options.noEmit = true;
  } catch (e) {
    setupFail(`Error parsing tsconfig.json.`);
    throw e;
  }
  setupOk(`Found tsconfig.json at ${configPath}`);

  const [typecheckOk, typecheckFail] = loadingAnimation(() => "Typecheck");
  let reducedDiagnostics: ReducedDiagnostics;
  try {
    reducedDiagnostics = await runWorker<TypescriptInput, ReducedDiagnostics>(
      path.resolve(__dirname, "./typecheck.worker.js"),
      { parsedConfig },
    );
  } catch (e) {
    typecheckFail(`Error running typecheck worker.`);
    throw e;
  }
  typecheckOk(
    `Found ${reducedDiagnostics.totalIssues} issues in ${reducedDiagnostics.paths.length} files`,
  );

  if (reducedDiagnostics.totalIssues <= 0) {
    return;
  }
  const { confirmCodeShift } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmCodeShift",
      message: `Before proceeding, make sure your project is saved on a VCS (github, gitlab...).
Do you want to run a code generator to insert // @ts-expect-error above the ${reducedDiagnostics.totalIssues} reported issues ?
(this operation will modify ${reducedDiagnostics.paths.length} files)`,
      default: false,
    },
  ]);
  if (!confirmCodeShift) {
    return;
  }

  const [codeShiftOk, codeShiftFail] = loadingAnimation(() => "JSCodeshift");
  const options = {
    parser: "tsx",
    extensions: "mjs,cjs,js,ts,jsx,tsx",
    dry: false,
    print: false,
    silent: true,
    issuesPerFile: reducedDiagnostics.issuesPerFile,
  };

  const transformerPath = path.resolve(
    __dirname,
    "expect-error.transformer.js",
  );
  let jscodeshift: {
    stats: {
      [messageName: string]: number;
    };
    timeElapsed: string;
    error: number;
    ok: number;
    nochange: number;
    skip: number;
  };
  try {
    jscodeshift = await run(transformerPath, reducedDiagnostics.paths, options);
  } catch (e) {
    codeShiftFail(`Error running JSCodeshift.`);
    throw e;
  }
  const { ok, error, skip, nochange } = jscodeshift;
  codeShiftOk(
    `${ok ? ok + " files were successfully modified." : ""}${nochange + skip ? nochange + skip + " files were skipped." : ""}${error ? error + " modifications failed." : ""}`,
  );

  const [tsMorphOk, tsMorphFail] = loadingAnimation(() => "ts-morph");
  let tsMorphOutput: TsMorphOutput;
  try {
    tsMorphOutput = await runWorker<TsMorphInput, TsMorphOutput>(
      path.resolve(__dirname, "./ts-morph.worker.js"),
      { configPath },
    );
  } catch (e) {
    tsMorphFail(`Error running ts-morph worker.`);
    throw e;
  }
  tsMorphOk(
    `Modified ${tsMorphOutput.filesModified} files for ${tsMorphOutput.issues} issues left.`,
  );
  console.log(
    "✨Codemod completed, please review the changes before committing. (code formatting may be required)",
  );
};

export default typescriptCodemod;
