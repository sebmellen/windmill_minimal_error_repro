import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

function matchesPattern(filename) {
	return filename === "flow.yaml" || filename.endsWith(".script.yaml");
}

function findFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const fullPath = path.join(dir, file);
		const stat = fs.statSync(fullPath);

		if (stat.isDirectory()) {
			findFiles(fullPath, fileList);
		} else if (matchesPattern(file)) {
			fileList.push(fullPath);
		}
	}

	return fileList;
}

function isTagMissingInYaml(filePath, tagName) {
	try {
		const fileContent = fs.readFileSync(filePath, "utf8");
		const data = yaml.load(fileContent);

		return !data || !Object.hasOwn(tagName);
	} catch (error) {
		console.error(`Failed to parse YAML file ${filePath}:`, e);
		return false;
	}
}

export async function main() {
	const directoryToSearch = "../f/";
	const tagName = "tag";
	const tagValues = [
		"light-high-priority",
		"heavy-high-priority",
		"light-scheduled",
		"heavy-scheduled",
	];

	const matchingFiles = findFiles(directoryToSearch);

	const filesWithTag = matchingFiles.filter((filePath) =>
		isTagMissingInYaml(filePath, tagName, tagValues),
	);

	console.log("Files with no specific tag or the right values:", filesWithTag);
}
