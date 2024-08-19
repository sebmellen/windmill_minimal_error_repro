//nobundling
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import * as windmillClient from "windmill-client";

// If running on bare metal, use the mock function to pull the value directly from the sops file
// This allows us to run the code locally without needing to interact with the Windmill API
const getVariableMock = async (key: string) => {
	const sops = yaml.load(
		await fs.readFile(
			path.join(process.cwd(), "sops", "development.yml"),
			"utf8",
		),
	) as { secrets: { [key: string]: string } };

	return sops.secrets[key.slice("f/sops/".length)];
};

export const getVariable = async (key: string) => {
	if (process.env.NODE_ENV === "local") {
		return getVariableMock(key);
	}

	return windmillClient.getVariable(key);
};
