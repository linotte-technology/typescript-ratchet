import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { Project, type SourceFile } from "ts-morph";

export type TsMorphInput = {
  configPath: string;
};

export type TsMorphOutput = {
  filesModified: number;
  issues: number;
};

// Run only on sub thread
if (!isMainThread) {
  const { configPath } = workerData as TsMorphInput;
  const project = new Project({
    tsConfigFilePath: configPath,
  });

  const diagnostics = project.getPreEmitDiagnostics();
  const fileChanges = new Map<SourceFile, { pos: number; text: string }[]>();
  let issues = 0;

  diagnostics.forEach((diagnostic) => {
    const sourceFile = diagnostic.getSourceFile();
    if (sourceFile && diagnostic.getStart() != null) {
      issues += 1;
      // Locate the node at the error position
      const node = sourceFile.getDescendantAtPos(diagnostic.getStart()!);
      if (node) {
        // Get the line position and text to determine indentation
        const linePos = node.getStartLinePos();
        const lineText = sourceFile
          .getFullText()
          .substring(linePos, node.getPos());

        // Extract the indentation (whitespace at the beginning of the line)
        const indentation = lineText.match(/^[\t ]*/)![0];

        // Insert a comment that includes the error message.
        if (!fileChanges.has(sourceFile)) {
          fileChanges.set(sourceFile, []);
        }
        fileChanges
          .get(sourceFile)!
          .push({
            pos: linePos,
            text: `${indentation}// @ts-expect-error ratchet TS${diagnostic.getCode()} (ts-morph)\n`,
          });
      }
    }
  });

  // Apply changes in reverse order for each file
  for (const [sourceFile, changes] of fileChanges.entries()) {
    // Sort changes in descending order by position (end to beginning)
    changes.sort((a, b) => b.pos - a.pos);

    // Apply each change
    for (const change of changes) {
      sourceFile.insertText(change.pos, change.text);
    }
  }
  project
    .save()
    .then(() =>
      parentPort?.postMessage({
        filesModified: fileChanges.size,
        issues,
      } satisfies TsMorphOutput),
    )
    .catch((e) => {
      throw e;
    });
}
