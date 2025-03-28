import chalk from "chalk";
import { Worker } from "node:worker_threads";

export function loadingAnimation(
  getText: () => string,
  chars = ["⠙", "⠘", "⠰", "⠴", "⠤", "⠦", "⠆", "⠃", "⠋", "⠉"],
  delay = 100,
): [(msg?: string) => void, (msg?: string) => void] {
  let x = 0;

  const intervalId = setInterval(function () {
    process.stdout.write(`\r${chalk.dim(chars[x])} ${getText()}`);
    x = (x + 1) % chars.length;
  }, delay);

  return [(message?: string) => {
    clearInterval(intervalId);
    process.stdout.write(`\r${chalk.bold.green("✔ ")}${getText()}\n`);
    if (message) {
      console.log(chalk.bold.green("↳ ") + message);
    }
  }, (message?: string) => {
    clearInterval(intervalId);
    process.stdout.write(`\r${chalk.bold.red("✕ ")}${getText()}\n`);
    if (message) {
      console.log(chalk.bold.red("↳ ") + message);
    }
  }];
}

export const runWorker = async <WorkerInput, WorkerOutput>(workerFileName: string, workerData: WorkerInput): Promise<WorkerOutput> =>
  new Promise((resolve, reject) => {
  const worker = new Worker(workerFileName, { workerData });

  worker.addListener("message", resolve);
  worker.addListener("error", reject);
});
