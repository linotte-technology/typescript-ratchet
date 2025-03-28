export type IssuesPerFile =
   {
     filePath: string;
     issues: {
       startLine: number;
       startCol: number;
       endLine: number;
       endCol: number;
       code: number;
       message: string;
     }[];
   }[];
