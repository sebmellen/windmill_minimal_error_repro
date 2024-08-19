import fs from "node:fs";
import path from "node:path";
import { execaCommand } from "execa";
import debounce from "lodash.debounce";

export async function main() {
	const folderArg = process.argv[2];
	if (!folderArg) {
		console.error(
			"\x1b[31m%s\x1b[0m",
			"Please provide a folder path as a command line argument.",
		);
		process.exit(1);
	}

	const fPath = path.resolve(__dirname, "..", folderArg);
	console.log("\x1b[33m%s\x1b[0m", `Watching ${fPath}`);
	console.log("\x1b[35m%s\x1b[0m", "Waiting for file changes");

	const onFileChange = debounce(async () => {
		console.log("\x1b[32m%s\x1b[0m", "Pushing to windmill");
		await execaCommand(
			"wmill sync push --yes --skip-variables --skip-secrets --skip-resources",
		);
		console.log("\x1b[32m%s\x1b[0m", "Pushed to windmill");
		console.log("\x1b[35m%s\x1b[0m", "Waiting for file changes");
	}, 1000);

	fs.watch(fPath, { recursive: true }, onFileChange);
}

main();
