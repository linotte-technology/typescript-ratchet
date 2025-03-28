import { isMainThread, parentPort, workerData } from "node:worker_threads";
import ts from "typescript";
import type { IssuesPerFile } from "./types";

export type ReducedDiagnostics = {
  paths: string[];
  issuesPerFile: IssuesPerFile;
  totalIssues: number;
};

export type TypescriptInput = {
  parsedConfig: ts.ParsedCommandLine;
}

// Run only on sub thread
if (!isMainThread) {
  const { parsedConfig } = workerData as TypescriptInput;

  // Create a program from the parsed fileNames and options
  const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);

  // Run typescript compiler
  const emitResult = program.emit();
  // Get all diagnostics
  const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  const reducedDiagnostics: ReducedDiagnostics = allDiagnostics.reduce(
    (ret, diagnostic) => {
      if (diagnostic.file && diagnostic.start != null) {
        ret.totalIssues += 1;
        const {
          line: startLine0idx, // To avoid confusion
          character: startCol, // Apparently this is 1-indexed
        } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const {
          line: endLine0idx,
          character: endCol,
        } = diagnostic.file.getLineAndCharacterOfPosition(
          diagnostic.start + (diagnostic.length ?? 0),
        );
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

        if (!ret.paths.includes(diagnostic.file.fileName)) {
          ret.paths.push(diagnostic.file.fileName);
          ret.issuesPerFile.push({
            filePath: diagnostic.file.fileName, issues: [
              {
                startLine: startLine0idx + 1,
                startCol,
                endLine: endLine0idx + 1,
                endCol,
                code: diagnostic.code,
                message,
              },
            ],
          });
        } else {
          const issuesForFile = ret.issuesPerFile.find(
            (issue) => issue.filePath === diagnostic.file?.fileName);
          if (issuesForFile) {
            issuesForFile.issues.push({
              startLine: startLine0idx + 1,
              startCol,
              endLine: endLine0idx + 1,
              endCol,
              code: diagnostic.code,
              message,
            });
          } else {
          // Redundant
            ret.issuesPerFile.push({
              filePath: diagnostic.file.fileName,
              issues: [
                {
                  startLine: startLine0idx + 1,
                  startCol,
                  endLine: endLine0idx + 1,
                  endCol,
                  code: diagnostic.code,
                  message,
                },
              ],
            });
          }
        }
      }
      return ret;
    },
    { paths: [], issuesPerFile: [], totalIssues: 0 } as ReducedDiagnostics,
  );
  parentPort?.postMessage(reducedDiagnostics);
}
