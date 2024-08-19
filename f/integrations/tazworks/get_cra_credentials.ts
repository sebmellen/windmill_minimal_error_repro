import { getVariable } from "/f/utilities/get_variable.ts";

export interface CraCredential {
	name: string;
	craGuid: string;
	craApiKey: string;
	baseCraUrl: string;
	vidBotAuth: {
		username: string;
		password: string;
		totpCode: string;
	};
}

export async function main(craGuid: string) {
	const rawSecret = await getVariable("f/sops/TAZWORKS_CRA_CREDENTIALS");
	const tazClientCredentials = JSON.parse(rawSecret) as CraCredential[];

	let credentials: CraCredential | null = null;

	for (const item of tazClientCredentials) {
		if (item.craGuid === craGuid) {
			credentials = item;
			break;
		}
	}

	if (!credentials) {
		throw new Error(`Cannot find stored SOPS credentials for cra: ${craGuid}`);
	}

	return credentials;
}
