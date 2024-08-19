import { getVariable } from "windmill-client";

interface RequestArgs {
	cra_id: string;
	body?: unknown;
	method: "POST" | "GET";
}

export async function main(
	path: string,
	{ cra_id, body, method }: RequestArgs,
) {
	const craTokensRaw = await getVariable("f/sops/TAZWORKS_CRA_API_TOKENS");
	const tazworksUrl = await getVariable("f/sops/TAZWORKS_INTEGRATION_API_URL");
	const craTokens = JSON.parse(craTokensRaw) as Array<{
		cra_id: string;
		token: string;
	}>;
	const cra = craTokens.find((item) => item.cra_id === cra_id);

	if (!cra) {
		throw new Error(`Could not find stored token for CRA: ${cra_id}`);
	}

	try {
		const res = await fetch(`${tazworksUrl}/v1/${path}`, {
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${cra.token}`,
			},
			method,
			body: JSON.stringify(body),
		});

		const result = await res.json();
		if (res.status >= 400) {
			console.error(result);
			throw new Error(result?.message ?? result);
		}
		return result;
	} catch (error) {
		console.error("an error occurred whilst making request to the Taz API");
		throw error;
	}
}

const request = main;

export const post = (path: string, requestArgs: RequestArgs) =>
	request(path, { ...requestArgs, method: "POST" });

export const get = (path: string, cra_id: string) =>
	request(path, { cra_id, method: "GET" });
