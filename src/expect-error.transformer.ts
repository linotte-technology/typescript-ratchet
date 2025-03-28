import type { API, ASTPath, FileInfo, Node } from "jscodeshift";
import type { IssuesPerFile } from "./types";

type MaybePath = ASTPath<Node> | undefined;

interface JSXElement extends Node {
  type: "JSXElement";
  children: Array<Node>;
}

export const transformerFileName = __filename;

export default function transformer(
  file: FileInfo,
  api: API,
  options: { issuesPerFile: IssuesPerFile },
) {
  const j = api.jscodeshift;
  const root = j(file.source);

  const issuesForFile = options.issuesPerFile.find(
    (issue) => issue.filePath === file.path,
  );

  if (issuesForFile) {
    const { issues, filePath: _filepath } = issuesForFile;
    root.find(j.Node).forEach((path) => {
      if (path.node.loc && path.node.loc.start) {
        issues.forEach((issue) => {
          if (
            path.node.loc?.start.line === issue.startLine &&
            path.node.loc?.start.column === issue.startCol &&
            path.node.loc?.end.line === issue.endLine &&
            path.node.loc?.end.column === issue.endCol
          ) {
            let currentPath: ASTPath<Node> = path;
            let parentPath: MaybePath = path.parentPath as MaybePath;
            let grandParentPath: MaybePath =
              parentPath?.parentPath as MaybePath;
            if (
              parentPath && // Filter some JSX cases
              (parentPath.node.type === "JSXOpeningElement" || // "<" We cannot insert comment between < and element name
                parentPath.node.type === "JSXAttribute") // "=" We cannot insert comment between = and attribute value
            ) {
              // We move up one level to select "<element>" or "attribute={value}"
              currentPath = parentPath;
              parentPath = currentPath.parentPath as MaybePath;
              grandParentPath = parentPath?.parentPath as MaybePath;
            }
            if (
              parentPath &&
              grandParentPath && // If we are inside a JSX tree (JSX element inside a JSX element) we need to insert a JSX comment
              parentPath.node.type === "JSXElement" &&
              grandParentPath.node.type === "JSXElement"
            ) {
              const parentNode = parentPath.node as JSXElement;
              const grandParentNode = grandParentPath.node as JSXElement;
              // JSX style comment
              const commentContent = j.jsxEmptyExpression();
              commentContent.comments = [
                j.commentBlock(
                  ` @ts-expect-error ratchet TS${issue.code} (jscodeshift) `,
                  false,
                  true,
                ),
              ];

              // Create a JSX expression containing the comment
              const jsxComment = j.jsxExpressionContainer(commentContent);

              // If in a JSX element, we need to insert the comment as a sibling
              const siblings = grandParentNode.children;
              const indexOfCurrentElement = siblings.indexOf(parentNode);

              if (indexOfCurrentElement !== -1) {
                // Insert the comment expression before the current element
                siblings.splice(indexOfCurrentElement, 0, j.jsxText("\n"));
                siblings.splice(indexOfCurrentElement, 0, jsxComment);
              }
            } else {
              // Normal JS style comment
              if (!currentPath.node.comments) {
                currentPath.node.comments = [];
              }
              currentPath.node.comments.push(
                j.commentLine(
                  ` @ts-expect-error ratchet TS${issue.code} (jscodeshift)`,
                ),
              );
            }
          }
        });
      }
    });
  }

  return root.toSource();
}
