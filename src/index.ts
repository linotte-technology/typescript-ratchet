#! /usr/bin/env node

import typescriptCodemod from "./typescript";
import { exit } from "node:process";
import { program } from "commander";
import pkg from "../package.json";

program
  .version(pkg.version)
  .description(
    "A CLI tool for incremental adoption of Typescript configuration",
  )
  .action(() => {
    typescriptCodemod()
      .then(() => {
        exit(0);
      })
      .catch((e) => {
        if (e instanceof Error) {
          console.error(e.message);
        }
        exit(1);
      });
  });

program.parse(process.argv);
