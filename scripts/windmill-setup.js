import https from "node:https";
import path from "node:path";
import axios from "axios";
import { $, execa } from "execa";
import { windmillPushSync } from "./wmill-cli-setup.js";

const axiosinsecure = axios.create({
	httpsAgent: new https.Agent({
		rejectUnauthorized: false,
	}),
});

const windmillUrl = "https://windmill.local.cerebrum.com";

async function waitForRoute(url) {
	try {
		while (true) {
			try {
				const response = await axiosinsecure.get(url);
				if (response.status === 200) {
					return; // Resolve if response status is 200
				}
			} catch (error) {
				if (error.response && error.response.status !== 502) {
					throw error; // Propagate the error if it's not a 502 error
				}
			}
			console.log(`Waiting for route ${url} to return 200...`);
			await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before trying again
		}
	} catch (error) {
		console.error("Error:", error);
		throw error; // Propagate the error if encountered
	}
}

// Function to log in and return the token
async function loginAndGetToken() {
	try {
		const response = await axiosinsecure.post(
			`${windmillUrl}/api/auth/login`,
			{ email: "admin@windmill.dev", password: "changeme" },
			{ headers: { "Content-Type": "application/json" } },
		);
		return response.data;
	} catch (error) {
		console.error("Login failed:", error.response.data);
		throw error; // Rethrow to handle outside
	}
}

// Check the workspace id is not taken
async function checkWorkspaceId(token) {
	try {
		const response = await axiosinsecure.post(
			`${windmillUrl}/api/workspaces/exists`,
			{ id: "integrations" },
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		console.log(
			response.data
				? "integrations workspace exists"
				: "integrations workspace does not exist, continue",
		);
		return response.data;
	} catch (error) {
		console.error(
			"Error checking if workspace id exists:",
			error.response.data,
		);
		throw error; // Rethrow to handle outside
	}
}

// Confirm that the user is okay with deleting the workspace
async function deleteWorkspaceConfirmation() {
	try {
		console.error(
			"Error: The integrations workspace already exists. It must be deleted and recreated to sync data to it.",
		);
		console.log("Do you want to continue? (Y/N): ");
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		let userInput = "";
		for await (const chunk of process.stdin) {
			userInput += chunk;
			if (userInput.length > 0) {
				process.stdin.pause();
				break;
			}
		}

		process.stdin.setRawMode(false);
		console.log();

		if (userInput.toLowerCase() === "y") {
			console.log("Deleting integrations workspace...");
		} else {
			console.error(
				"Cannot continue without an empty integrations workspace. Exiting...",
			);
			process.exit();
		}
	} catch (error) {
		console.error(error);
		throw error;
	}
}

async function deleteIntegrationsWorkspace(token) {
	try {
		const response = await axiosinsecure.delete(
			`${windmillUrl}/api/workspaces/delete/integrations`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		return response.data;
	} catch (error) {
		console.error(
			"Failed to delete integrations workspace:",
			error.response.data,
		);
		throw error;
	}
}

// Function to create a workspace using the token
async function createWorkspace(token) {
	try {
		const response = await axiosinsecure.post(
			`${windmillUrl}/api/workspaces/create`,
			{ id: "integrations", name: "integrations" },
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		console.log("Workspace created:", response.data);
	} catch (error) {
		console.error("Error creating workspace:", error.response.data);
		throw error; // Rethrow to handle outside
	}
}

// Add enterprise license key
async function addEnterpriseLicenseKey(token, key) {
	try {
		const response = await axios.post(
			"https://windmill.local.cerebrum.com/api/settings/global/license_key",
			{
				value: key,
			},
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);
		console.log(`Added enterprise license key! ${response.data}`);
	} catch (error) {
		console.error("Error:", error);
	}
}

// Main function to orchestrate the workflow
async function main() {
	try {
		await waitForRoute(windmillUrl);
		const token = await loginAndGetToken();
		console.log("Token: ", token);
		if ((await checkWorkspaceId(token)) === true) {
			await deleteWorkspaceConfirmation();
			await deleteIntegrationsWorkspace(token);
			console.log("Sucessfully deleted integrations workspace!");
		}
		console.log("Token: ", token);
		await createWorkspace(token);
		await windmillPushSync(token);
		await addEnterpriseLicenseKey(token, process.env.WINDMILL_LICENSE_KEY);
		return token;
	} catch (error) {
		console.error("An error occurred in the process:", error);
	}
}

main();
