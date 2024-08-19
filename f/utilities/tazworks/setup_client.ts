//nobundling
import { Configuration, NeuronApi } from "@cerebruminc/neuron-sdk";
import axios from "axios";
import { TazWorksSDK } from "/f/integrations/tazworks/sdk/index.ts";
import { getVariable } from "/f/utilities/get_variable.ts";

export async function getCortexOrg(clientGuid: string) {
	const apiKey = await getVariable("f/sops/NEURON_SUPER_ADMIN_API_KEY");
	const apiUrl = await getVariable("f/sops/CORTEX_API_PUBLIC_URL");

	const query = `
	query Organizations($where: OrganizationWhereInput) {
		organizations(where: $where) {
		  name
		  metadata
		  id
		}
	}`;

	const variables = {
		where: {
			metadata: {
				path: ["tazworks", "clientGuid"],
				equals: clientGuid,
			},
		},
	};

	const res = await axios.post(
		`${apiUrl}/graphql`,
		{
			query,
			variables,
		},
		{
			headers: {
				"cache-control": "no-cache",
				"content-type": "application/json",
				pragma: "no-cache",
				apiKey,
			},
		},
	);

	const result = res.data;

	if (result.errors) {
		console.error(result.errors);
		throw new Error(result.errors[0].message);
	}
	const organizations = result?.data?.organizations;

	return organizations;
}

export async function createOnePackageSet({
	name,
	shortName,
	showDisclosures = false,
	organizationId,
	metadata,
}: {
	name: string;
	shortName: string;
	showDisclosures: boolean;
	organizationId: string;
	metadata: {
		tazworks: {
			craGuid: string;
			clientProductGuid: string;
		};
	};
}) {
	const apiKey = await getVariable("f/sops/NEURON_SUPER_ADMIN_API_KEY");
	const apiUrl = await getVariable("f/sops/CORTEX_API_PUBLIC_URL");

	const query = `
	mutation CreateOnePackageSet($data: PackageSetCreateInput!) {
		createOnePackageSet(data: $data) {
		  id
		  name
		  shortName
		}
	  }
	`;

	const variables = {
		data: {
			name,
			shortName,
			showDisclosures,
			metadata,
			organizationId,
			searchTypes: {
				connect: [
					{
						name: "standardIdVerification",
					},
				],
			},
		},
	};

	const res = await axios.post(
		`${apiUrl}/graphql`,
		{
			query,
			variables,
		},
		{
			headers: {
				"cache-control": "no-cache",
				"content-type": "application/json",
				pragma: "no-cache",
				apiKey,
			},
		},
	);

	const result = res.data;

	if (result.errors) {
		console.error(result.errors);
		throw new Error(result.errors[0].message);
	}
	const packageSet = result?.data?.createOnePackageSet;

	return packageSet;
}

export async function getPackages(clientProductGuid: string) {
	const apiKey = await getVariable("f/sops/NEURON_SUPER_ADMIN_API_KEY");
	const apiUrl = await getVariable("f/sops/CORTEX_API_PUBLIC_URL");

	const query = `
  query PackageSets($where: PackageSetWhereInput) {
  packageSets(where: $where) {
    name
    id
    metadata
  }
  }`;
	const variables = {
		where: {
			metadata: {
				path: ["tazworks", "clientProductGuid"],
				equals: clientProductGuid,
			},
		},
	};

	const res = await axios.post(
		`${apiUrl}/graphql`,
		{
			query,
			variables,
		},
		{
			headers: {
				"cache-control": "no-cache",
				"content-type": "application/json",
				pragma: "no-cache",
				apiKey,
			},
		},
	);

	const result = res.data;

	if (result.errors) {
		console.error(result.errors);
		throw new Error(result.errors[0].message);
	}
	const packageSets = result?.data?.packageSets;

	return packageSets;
}

export async function main(
	clientGuid: string,
	craGuid: string,
	productName?: string,
) {
	const apiKey = await getVariable("f/sops/NEURON_SUPER_ADMIN_API_KEY");
	const apiUrl = await getVariable("f/sops/CORTEX_API_PUBLIC_URL");

	const neuronApiUrl = apiUrl.replace("://", "://neuron-api.");

	const neuronSdk = new NeuronApi(
		new Configuration({
			basePath: neuronApiUrl,
			apiKey: (key: string) => {
				if (key === "x-api-key") return apiKey;
				return "";
			},
			baseOptions: {
				withCredentials: true,
			},
		}),
		undefined,
		axios,
	);

	const sdk = new TazWorksSDK(craGuid);
	await sdk.init();

	const client = await sdk.getClient(clientGuid);
	console.log("Client:", client);

	const organizations = await getCortexOrg(clientGuid);
	console.log("Organizations:", organizations);

	if (organizations.length > 1) {
		throw new Error(
			`Found multiple organizations for clientGuid ${clientGuid}`,
		);
	}

	let org = organizations[0];

	if (!org) {
		console.log("Creating new organization...");
		org = await neuronSdk.createOrganization({
			addresses: [
				{
					addressLineOne: client.physicalAddress.streetOne,
					addressLineTwo: client.physicalAddress.streetTwo ?? "",
					city: client.physicalAddress.city,
					state: client.physicalAddress.state,
					postalCode: client.physicalAddress.zipCode,
				},
			],
			name: client.name,
			legalName: client.inquiryName,
			contactEmail: client.email,
			contactName: client.contact,
			contactPhone: client.phone ?? "",
			hexColor: "#00F",
			shortName: client.code,
			metadata: JSON.stringify({
				tazworks: {
					clientGuid,
					craGuid,
					isCra: false,
				},
			}) as unknown as object,
		});
	}

	// Find matching org in Cortex
	const clientProducts = await sdk.getClientProducts(clientGuid);
	console.log("ClientProducts:", clientProducts);

	// Create a package if product name matches a productName parameter or has "vID" in the name
	for (const product of clientProducts) {
		if (productName) {
			if (productName !== product.productName) {
				continue;
			}
		} else if (!product.productName.includes("vID")) {
			continue;
		}

		const packages = await getPackages(product.clientProductGuid);
		console.log("Found existing packages:", packages);

		if (!packages.length) {
			console.log("Creating package set...");

			const packageSet = await createOnePackageSet({
				name: product.productName,
				shortName: product.productName,
				showDisclosures: false,
				organizationId: org.id,
				metadata: {
					tazworks: {
						craGuid: craGuid,
						clientProductGuid: product.clientProductGuid,
					},
				},
			});

			console.log("Created package set:", packageSet);
		}
	}
}
