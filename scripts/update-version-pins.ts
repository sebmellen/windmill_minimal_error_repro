import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import ts from "typescript";

// Function to read all TypeScript files
function readTSFiles(directory: string): string[] {
	try {
		return glob.sync(`${directory}/**/*.ts`);
	} catch (error) {
		console.error("Failed to read TypeScript files:", error);
		return [];
	}
}

// Function to extract import statements using TypeScript
function extractImports(file: string): string[] {
	try {
		const content = fs.readFileSync(file, "utf8");
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);

		const imports: string[] = [];

		function visit(node: ts.Node) {
			if (
				ts.isImportDeclaration(node) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			) {
				imports.push(node.moduleSpecifier.text);
			}
			ts.forEachChild(node, visit);
		}

		ts.forEachChild(sourceFile, visit);

		return imports.filter((importPath) => !importPath.startsWith("/f/"));
	} catch (error) {
		console.error("Failed to extract imports from file:", file, error);
		return [];
	}
}

// Define the type for packageJsonCache
interface PackageJsonCache {
	// biome-ignore lint/suspicious/noExplicitAny: TODO FIX IN THE FUTURE
	[directory: string]: any; // Use 'any' or a more specific type if known
}

// Initialize a cache object with the defined type
const packageJsonCache: PackageJsonCache = {};

// Function to find the nearest package.json with caching
function findPackageJson(directory: string) {
	if (packageJsonCache[directory]) {
		return packageJsonCache[directory];
	}

	let currentDir = directory;
	try {
		while (currentDir !== path.resolve(currentDir, "..")) {
			const pkgPath = path.join(currentDir, "package.json");
			if (fs.existsSync(pkgPath)) {
				const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
				packageJsonCache[directory] = pkgJson; // Cache the found package.json
				return pkgJson;
			}
			currentDir = path.resolve(currentDir, "..");
		}
	} catch (error) {
		console.error(
			"Failed to find package.json in directory:",
			directory,
			error,
		);
	}
	return null;
}

// Function to modify import statements
function modifyImports(file: string, imports: string[], directory: string) {
	try {
		let content = fs.readFileSync(file, "utf8");
		for (const importPath of imports) {
			const pkgJson = findPackageJson(directory);
			const version = pkgJson?.dependencies?.[importPath];
			if (version) {
				const newImportPath = `${importPath}@${version}`;
				content = content.replace(
					`from "${importPath}"`,
					`from "${newImportPath}"`,
				);
			}
		}
		fs.writeFileSync(file, content);
	} catch (error) {
		console.error("Failed to modify imports in file:", file, error);
	}
}

// Function to remove version pinning from imports
function unpinImports(file: string) {
	try {
		let content = fs.readFileSync(file, "utf8");
		const regex =
			/@(?:\^|~|>|>=|<|<=)?\d+\.\d+\.\d+(-[a-zA-Z0-9-.]+)?|@\*|@latest|@\d+\.\d+\.x/g;
		content = content.replace(regex, "");
		fs.writeFileSync(file, content);
	} catch (error) {
		console.error("Failed to unpin imports in file:", file, error);
	}
}

// Updated function to rename local imports
function renameLocalImports(file: string) {
	try {
		let content = fs.readFileSync(file, "utf8");
		const localImportRegex =
			/^(import\s+(?:{[\s\S]*?}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:{[\s\S]*?}|\*\s+as\s+\w+|\w+))*\s+from\s+['"])(\/[^'"]+['"];\s*)$/gm;
		content = content.replace(localImportRegex, (match, p1, p2) => {
			const lines = match.split("\n");
			return lines
				.map((line, index) =>
					index === 0 ? `//zzzzzzzzz_${line}` : `//           ${line}`,
				)
				.join("\n");
		});
		fs.writeFileSync(file, content);
	} catch (error) {
		console.error("Failed to rename local imports in file:", file, error);
	}
}

// Updated function to restore renamed local imports
function restoreLocalImports(file: string) {
	try {
		let content = fs.readFileSync(file, "utf8");
		const renamedLocalImportRegex =
			/^\/\/zzzzzzzzz_(import[\s\S]*?from\s+['"]\/[^'"]+['"];\s*)$/gm;
		content = content.replace(renamedLocalImportRegex, (match) => {
			return match
				.split("\n")
				.map((line) => line.replace(/^\/\/\s*z*_?\s*/, ""))
				.join("\n");
		});
		fs.writeFileSync(file, content);
	} catch (error) {
		console.error("Failed to restore local imports in file:", file, error);
	}
}

// Updated toggleVersionPinning function
function toggleVersionPinning(
	directory: string,
	pin = true,
	renameLocals = false,
	restoreLocals = false,
) {
	try {
		const files = readTSFiles(directory);
		for (const file of files) {
			if (pin) {
				const imports = extractImports(file);
				modifyImports(file, imports, path.dirname(file));
				if (renameLocals) {
					renameLocalImports(file);
				}
			} else {
				unpinImports(file);
				if (restoreLocals) {
					restoreLocalImports(file);
				}
			}
		}
	} catch (error) {
		console.error(
			"Failed to toggle version pinning in directory:",
			directory,
			error,
		);
	}
}

// Updated main function
function main(directory: string, renameLocals = false, restoreLocals = false) {
	try {
		console.log("Starting version pinning...");
		toggleVersionPinning(directory, true, renameLocals, restoreLocals);
		console.log("Version pinning completed.");
		if (renameLocals) {
			console.log("Local imports renamed.");
		}
		if (restoreLocals) {
			console.log("Local imports restored.");
		}
	} catch (error) {
		console.error(
			"Failed to run main function for directory:",
			directory,
			error,
		);
	}
}

// Updated command-line argument handling
const args = process.argv.slice(2);
const directory = "./f/";
const renameLocals = args.includes("--rename-local-imports");
const restoreLocals = args.includes("--restore-local-imports");
const unpin = args.includes("--unpin");

if (unpin) {
	toggleVersionPinning(directory, false, false, restoreLocals);
} else {
	main(directory, renameLocals, false); // Never restore when pinning
}
