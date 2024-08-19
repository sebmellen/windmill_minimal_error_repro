import axios from "axios";

interface CraCredential {
	name: string;
	craGuid: string;
	craApiKey: string;
	baseCraUrl: string;
	instanceGuid: string;
	vidBotAuth: {
		username: string;
		password: string;
		totpCode: string;
	};
}

export async function main(craCredentials: CraCredential) {
	console.log("Getting orders on", craCredentials.name);

	const clientsResponse = await axios.get(
		"https://api.instascreen.net/v1/clients/",
		{
			headers: {
				Authorization: `Bearer ${craCredentials.craApiKey}`,
			},
		},
	);

	console.log("Clients found for CRA:", clientsResponse.data.length);

	// Initialize an empty array to store the orders data
	const ordersData = [];

	for (const client of clientsResponse.data) {
		console.log(`Checking orders for client: ${client.name} (${client.code}))`);

		const data = await axios.get(
			`https://api.instascreen.net/v1/clients/${client.clientGuid}/orders?page=0&size=100`,
			{
				headers: {
					Authorization: `Bearer ${craCredentials.craApiKey}`,
				},
			},
		);

		// Add the current data to the ordersData array
		ordersData.push(data.data);
	}

	// Log or return the accumulated data
	return ordersData;
}
