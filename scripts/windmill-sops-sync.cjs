const fs = require("node:fs").promises;
const yaml = require("js-yaml");
const axios = require("axios");
const https = require("node:https");

const inputFilePath = process.env.INPUT_FILE_PATH;
const workspaceName = process.env.WORKSPACE_NAME;
const windmillToken = process.env.WINDMILL_TOKEN;
const windmillApiUrl = `${process.env.WINDMILL_API_URL}/api/w/${workspaceName}`;

console.log(
	`\nWindmill token: ${windmillToken}`,
	`\nWorkspace name: ${workspaceName}`,
	`\nWindmill API URL: ${windmillApiUrl}\n`,
);

const axiosinsecure = axios.create({
	httpsAgent: new https.Agent({
		rejectUnauthorized: false,
	}),
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bearer ${windmillToken}`,
	},
});

async function sopsSecretRemap(inputFilePath) {
	const fileContents = await fs.readFile(inputFilePath, "utf8");
	const data = yaml.load(fileContents);
	const secrets = data.secrets;

	return Object.keys(secrets).map((key) => {
		console.log(`Remapping YAML to JSON for secret: ${key}`);

		let secretValue = secrets[key];

		if (typeof secretValue === "object") {
			secretValue = JSON.stringify(secrets[key]);
		}

		return {
			name: key,
			value: secretValue,
			is_secret: true,
			description: "SECRET VALUE IMPORTED FROM SOPS",
			path: `f/sops/${key}`,
		};
	});
}

async function push(secrets) {
	for (const secret of secrets) {
		const secretPath = secret.path;
		const requestBody = JSON.stringify(secret);

		try {
			await updateSecret(secretPath, requestBody);
		} catch {
			await createSecret(secretPath, requestBody);
		}
	}
}

async function updateSecret(secretPath, requestBody) {
	await axiosinsecure.post(
		`${windmillApiUrl}/variables/update/${secretPath}`,
		requestBody,
	);
	console.log(`Updated secret: ${secretPath}`);
}

async function createSecret(secretPath, requestBody) {
	await axiosinsecure.post(`${windmillApiUrl}/variables/create`, requestBody);
	console.log(`Created secret: ${secretPath}`);
}

(async () => {
	const secrets = await sopsSecretRemap(inputFilePath);
	console.log("\nAll variables converted to JSON!");
	console.log("Now pushing secrets to /f/sops in Windmill\n");
	await push(secrets);
	console.log("\nPush complete!");
})();
