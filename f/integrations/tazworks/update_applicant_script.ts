// nobundling
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import { load } from "cheerio";
import { format, parse } from "date-fns";
import type { Page } from "playwright";
import { TazWorksSDK } from "/f/integrations/tazworks/sdk/index.ts";
import { ResultSearchType, getCortexSdk } from "/f/utilities/get_cortex_sdk.ts";
import { getVariable } from "/f/utilities/get_variable.ts";

interface ApplicantDetails {
	applicant: {
		firstName: string;
		middleName: string;
		lastName: string;
		suffix: string;
		socialSecurityNumber: string;
		dateOfBirth: string;
		aliases: Array<{
			firstName: string;
			middleName: string;
			lastName: string;
			suffix: string;
			socialSecurityNumber: string;
			dateOfBirth: string;
		}>;
	};
	address: {
		type: string;
		country: string;
		streetOne: string;
		postalCode: string;
		city: string;
		state: string;
		aliases: Array<{
			type: string;
			country: string;
			streetOne: string;
			postalCode: string;
			city: string;
			state: string;
		}>;
	};
}

async function getDisclosureAcceptancePDFs(orderId: string) {
	const apiKey = await getVariable("f/sops/NEURON_SUPER_ADMIN_API_KEY");
	const apiUrl = await getVariable("f/sops/CORTEX_API_PUBLIC_URL");
	try {
		const { data: disclosureAcceptanceResponse } = await axios.post(
			`${apiUrl}/graphql`,
			{
				query: `
					query DisclosureAcceptances($where: DisclosureAcceptanceWhereInput) {
						disclosureAcceptances(where: $where) {
							id
						}
					}
				`,
				variables: {
					where: {
						orderId: {
							equals: orderId,
						},
					},
				},
			},
			{
				headers: { apikey: apiKey, "Content-Type": "application/json" },
			},
		);
		if (disclosureAcceptanceResponse.errors) {
			console.error(
				"Error fetching disclosure acceptance:",
				disclosureAcceptanceResponse.errors,
			);
			throw new Error("Error fetching disclosure acceptance");
		}
		console.log(
			"Disclosure Acceptance Response:",
			disclosureAcceptanceResponse.data,
		);

		const pdfUrls = [];

		for (const disclosureAcceptance of disclosureAcceptanceResponse.data
			.disclosureAcceptances) {
			const { data: pdfResponse } = await axios.post(
				`${apiUrl}/graphql`,
				{
					query: `
						query GenerateSignedDisclosurePdf($disclosureAcceptanceId: String!) {
							generateSignedDisclosurePdf(disclosureAcceptanceId: $disclosureAcceptanceId) {
								pdfId
								pdfUrl
							}
						}
					`,
					variables: {
						disclosureAcceptanceId: disclosureAcceptance.id,
					},
				},
				{
					headers: { apikey: apiKey, "Content-Type": "application/json" },
				},
			);
			if (pdfResponse.errors) {
				console.error(
					"Error fetching disclosure acceptance PDF:",
					pdfResponse.errors,
				);
				throw new Error("Error fetching disclosure acceptance PDF");
			}
			console.log("PDF Response:", pdfResponse.data);
			const item = pdfResponse.data.generateSignedDisclosurePdf;
			pdfUrls.push({
				url: item.pdfUrl,
				id: item.pdfId,
				name: `vID-disclosure-${item.pdfId}.pdf`,
			});
		}

		return pdfUrls;
		// biome-ignore lint/suspicious/noExplicitAny: TODO FIX IN THE FUTURE
	} catch (error: any) {
		if (error?.response?.data) {
			console.error(
				"Error fetching disclosure acceptance:",
				error.response.data,
			);
		}

		throw error;
	}
}

const delay = (time: number) =>
	new Promise((resolve) => setTimeout(resolve, time));

export async function main(
	craGuid: string,
	fileNumber: number,
	applicantDetails: ApplicantDetails,
	orderId: string,
) {
	if (!craGuid) {
		throw new Error("CRA Guid is required");
	}
	if (!fileNumber) {
		throw new Error("File number is required");
	}
	if (!applicantDetails) {
		throw new Error("Applicant details are required");
	}
	if (!orderId) {
		throw new Error("Order id is required");
	}

	const cortexSdk = await getCortexSdk();

	const { order } = await cortexSdk.updateApplicantGetOrder({
		where: {
			id: orderId,
		},
		resultsWhere: {
			searchType: {
				equals: ResultSearchType.StandardIdVerification,
			},
		},
	});

	if (!order) {
		throw new Error(`Order with id ${orderId} not found`);
	}

	const tazSdk = new TazWorksSDK(craGuid);
	await tazSdk.init();

	const page = await tazSdk.login();

	const baseCraUrl = tazSdk.getBaseCraUrl();

	await page.goto(`${baseCraUrl}/workspace/results.taz?file=${fileNumber}`);
	console.log("Navigated to:", page.url());

	await delay(1500);

	// Look for the search group, then find if there is one which doesn't contain vID.
	// If there is a non-vID search, then we shouldn't update the applicant.
	// const searchGroup = await page.locator('.search-group:has-text("vID")');

	// Extract the HTML content of the <div id="search-results">
	const htmlContent = await page.$eval("#search-results", (el) => el.outerHTML);

	// Use Cheerio to load and process the HTML
	const $ = load(htmlContent);

	// Find all search groups
	const searchGroups = $(".search-group");
	let hasNonVIDSearch = false;

	// Iterate through each search group
	searchGroups.each((_, group) => {
		const groupText = $(group).text();
		if (!groupText.includes("vID")) {
			hasNonVIDSearch = true;
			return false; // Break out of the loop
		}
	});

	if (!hasNonVIDSearch) {
		const editApplicantNavigationPromise = page.waitForNavigation();
		console.log("running editOrder()");
		await page.evaluate("editOrder()");
		await editApplicantNavigationPromise;

		console.log("opening editOrder route");
		if (page.url() !== `${baseCraUrl}/reportresults/editOrder.taz`) {
			console.error(
				"Page url is not correct. Expected:",
				`${baseCraUrl}/reportresults/editOrder.taz`,
				"Actual:",
				page.url(),
			);
			throw new Error("Failed to navigate to editOrder route");
		}

		const token = await page.$eval(
			'input[type="hidden"][id="token"]',
			(input) => {
				return input.getAttribute("value");
			},
		);
		const beanCid = await page.$eval(
			'input[type="hidden"][id="bean_cid"]',
			(input) => {
				return input.getAttribute("value");
			},
		);
		if (!beanCid) {
			throw new Error("Bean CID not found");
		}

		if (!token) {
			throw new Error("Token not found");
		}

		await page.evaluate("editOrderAliasAddress(1, 'addresses', 'addresses')");

		// Use the CSRF token and beanCid to submit a POST request to the editOrder route
		await page.evaluate(
			async ({ applicantDetails, beanCid, token, baseCraUrl, fileNumber }) => {
				const logAndFormatDOB = (dob) =>
					console.log("Applicant DOB >>>>>", dob);
				const logError = (error) =>
					console.error("Error setting up alias:", error.message);

				// Function to handle fetch requests
				async function submitFormData(url, formData) {
					const formattedBody = Object.entries(formData)
						.map(
							([key, value]) =>
								`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
						)
						.join("&");
					try {
						await fetch(url, {
							headers: {
								accept: "*/*",
								"accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
								"content-type":
									"application/x-www-form-urlencoded; charset=UTF-8",
								"sec-fetch-dest": "empty",
								"sec-fetch-mode": "cors",
								"sec-fetch-site": "same-origin",
								"x-requested-with": "XMLHttpRequest",
							},
							referrer: `${baseCraUrl}/reportresults/editOrder.taz`,
							referrerPolicy: "same-origin",
							body: formattedBody,
							method: "POST",
							mode: "cors",
							credentials: "include",
						});
					} catch (error) {
						logError(error);
					}
				}

				// Initial logging of applicant DOB
				logAndFormatDOB(applicantDetails?.applicant?.dateOfBirth);

				// Form data for the main submission
				const formData = {
					bean_cid: beanCid,
					token: token,
					"order.reference": "REFERENCE HERE",
					"applicant.proposedPosition": "",
					"applicant.proposedSalary": "",
					"applicant.lastName":
						applicantDetails?.applicant?.lastName?.toUpperCase(),
					"applicant.firstName":
						applicantDetails?.applicant?.firstName?.toUpperCase(),
					"applicant.middleName":
						applicantDetails?.applicant?.middleName?.toUpperCase(),
					"_applicant.noMiddleName": "on",
					"applicant.generation": "",
					"applicant.SSN": applicantDetails?.applicant?.socialSecurityNumber,
					"applicant.DOB": applicantDetails?.applicant?.dateOfBirth,
					"addresses[0].type": "domestic",
					"addresses[0].country": "United States of America",
					"addresses[0].streetOne":
						applicantDetails?.address?.streetOne?.toUpperCase(),
					"addresses[0].streetTwo": "",
					"addresses[0].postalCode": applicantDetails?.address?.postalCode,
					"addresses[0].city": applicantDetails?.address?.city?.toUpperCase(),
					"addresses[0].state": applicantDetails?.address?.state?.toUpperCase(),
					"address-list-size": "1",
					"order.orderNotes": `ID Was vID Verified on ${new Date().toISOString()}. See Attached PDF`,
					// Without the file field, the update will fail silently
					file: fileNumber,
				};

				// Process aliases if present
				const aliasPromises = (applicantDetails?.applicant?.aliases || []).map(
					(alias, index) => {
						const aliasFormData = {
							bean_cid: beanCid,
							token: token,
							aliasType: "applicant",
							size: index + 1,
							action: "showAliases",
							ssn: alias.socialSecurityNumber ?? "",
							dob: alias.dateOfBirth ?? "", // Make sure to format or validate DOB as required
							"aliases[${index}].lastName": alias.lastName.toUpperCase(),
							"aliases[${index}].firstName": alias.firstName.toUpperCase(),
							"aliases[${index}].middleName":
								alias.middleName?.toUpperCase() ?? "",
							"aliases[${index}].noMiddleName": alias.middleName
								? "false"
								: "true",
							"aliases[${index}].generation": "",
							"aliases[${index}].DOB": alias.dateOfBirth ?? "",
							"aliases[${index}].SSN": alias.socialSecurityNumber,
						};
						return submitFormData(
							`${baseCraUrl}/send/editnameaddress`,
							aliasFormData,
						);
					},
				);

				// Wait for all alias updates to be submitted
				await Promise.all(aliasPromises);

				// Final submission of the main form
				await submitFormData(
					`${baseCraUrl}/reportresults/editOrder.taz`,
					formData,
				);
			},
			{
				applicantDetails: applicantDetails, // These should be defined in your script outside this block
				beanCid: beanCid,
				token: token,
				baseCraUrl: baseCraUrl,
				fileNumber: fileNumber,
			},
		);

		if (order.packageSets[0]?.metadata.tazworks.addNatCrimAlias) {
			console.log(
				"Got `addNatCrimAlias` flag in package metadata, adding NatCrim search...",
			);

			// Navigate to order page
			await page.goto(`${baseCraUrl}/workspace/results.taz?file=${fileNumber}`);

			// Add natcrim search
			await page.click('button[title="Add Search to Order"]');

			// Select natcrim checkbox
			await page.click('label[for="INV_INSTACRIM_NATIONAL_ALIAS"]');

			// Click "Next" button
			await page.getByText("Next ").click();

			// All the fields are filled, so applicant info page will be skipped, click "Add To Order" button
			await page.locator("#completeOrder").click();
		}
	}

	await page.goto(`${baseCraUrl}/workspace/results.taz?file=${fileNumber}`);

	console.log("Returned to page:", page.url());

	await delay(1500);

	const orderGuid = await page.evaluate(() => {
		return document.querySelector("#orderGuid")?.value;
	});

	if (!orderGuid) {
		throw new Error("Order GUID not found");
	}

	const orderApplicantInfo = await page.evaluate(() => {
		const infoDiv = document.querySelector("#applicant-information");
		if (infoDiv?.textContent) {
			// Process the text content of the infoDiv into a sequence of label + value
			const parts = infoDiv.textContent
				.split("\n")
				.map((x) => x.trim().replace(/:$/g, ""))
				.filter((x) => x);
			console.log("Parts:", parts);
			const info = {};
			for (let i = 0; i < parts.length; i += 2) {
				// Alias values have the same key, so make sure they are prefixed
				if (info[parts[i]]) {
					info[`${parts[i]}_${i}`] = parts[i + 1];
				} else {
					info[parts[i]] = parts[i + 1];
				}
			}
			return info;
		}
		return null; // Return null if no element is found
	});
	console.log("Full Name:", orderApplicantInfo?.Name);
	console.log(orderApplicantInfo);

	const { address, applicant } = applicantDetails;
	const response = {
		orderGuid,
		input: {
			fullName:
				`${applicant.lastName}, ${applicant.firstName} ${applicant.middleName}`.toUpperCase(),
			address:
				`${address.streetOne}, ${address.city}, ${address.state} ${address.postalCode}`.toUpperCase(),
			ssnAndDob: `${applicant.socialSecurityNumber} / ${format(
				new Date(applicant.dateOfBirth),
				"MM-dd-yyyy",
			)}`,
		},
		output: {
			fullName: orderApplicantInfo?.Name,
			ssnAndDob: orderApplicantInfo?.["SSN/DOB"]
				?.replace(/\s*\(\d+\)$/, "")
				.replace(
					/(\d{3}-\d{2}-\d{4})\s*\/\s*(\d{2}-\d{2}-\d{4})/,
					(_, ssn, dob) => {
						const parsedDate = parse(dob, "MM-dd-yyyy", new Date());
						return `${ssn} / ${format(parsedDate, "MM-dd-yyyy")}`;
					},
				),
			address: orderApplicantInfo?.Address,
		},
		isExactMatch: false,
	};

	response.isExactMatch =
		response.input.fullName === response.output.fullName &&
		response.input.ssnAndDob === response.output.ssnAndDob &&
		response.input.address === response.output.address;

	console.log("Generating disclosure acceptance PDFs");
	const pdfs: PDF[] = await getDisclosureAcceptancePDFs(orderId);

	if (order.results[0]?.attachments?.[0]) {
		pdfs.push({
			id: order.results[0].attachments[0].id,
			url: order.results[0].attachments[0].url,
			name: `vID-id-verification-report-${order.results[0].attachments[0].id}.pdf`,
		});
	}

	// SECTION_ UPLOAD PDFS

	const token = await page.$eval<string, HTMLInputElement>(
		'input[type="hidden"][id="token"]',
		(input) => input.getAttribute("value") || "",
	);
	console.log("Extracted Token:", token);

	// Construct the URL with the extracted GUID
	const url = `${baseCraUrl}/ui/v1/attachments/order/${orderGuid}.json`;
	const refererUrl = `${baseCraUrl}/is/app/attachments/order/${orderGuid}`;

	const pdfsForUpload: PDF[] = [];

	for (const pdf of pdfs) {
		const existingFile = await page.$(`a:has-text("${pdf.name}")`);
		if (existingFile) {
			console.log(`PDF ${pdf.name} already uploaded`);
		} else {
			pdfsForUpload.push(pdf);
		}
	}
	async function uploadPDFs(
		pdfsForUpload: PDF[],
		url: string,
		refererUrl: string,
		token: string,
		page: Page,
	) {
		const failedUploads: string[] = [];

		if (pdfsForUpload.length) {
			console.log(`Uploading ${pdfsForUpload.length} PDFs to CRA`);

			for (const pdf of pdfsForUpload) {
				await delay(500);
				console.log("Downloading PDF from:", pdf.url);

				try {
					const response = await axios.get<ArrayBuffer>(pdf.url, {
						responseType: "arraybuffer",
					});

					const pdfPath = path.join(os.tmpdir(), pdf.name);
					console.log("Writing PDF to:", pdfPath);
					await fs.writeFile(pdfPath, Buffer.from(response.data));

					const pdfData = await fs.readFile(pdfPath);
					let uploadSuccess = false;
					let attempts = 0;
					const maxAttempts = 3;

					while (!uploadSuccess && attempts < maxAttempts) {
						attempts++;
						const result = await uploadPdfUsingFetch(
							page,
							url,
							refererUrl,
							pdfData,
							pdf.name,
							token,
						);

						if (result.success) {
							uploadSuccess = true;
							console.log(
								`Upload successful for ${pdf.name} on attempt ${attempts}`,
							);

							// Refresh the page
							await page.reload();

							// Wait for the uploaded PDF to appear
							await page.waitForSelector(`a:has-text("${pdf.name}")`);
							console.log(`Verified PDF upload for ${pdf.name}`);
						} else {
							console.error(
								`Upload failed for ${pdf.name} on attempt ${attempts}:`,
								result.message,
							);
							if (attempts < maxAttempts) {
								console.log("Retrying upload in 5 seconds...");
								await delay(5000);
							}
						}
					}

					if (!uploadSuccess) {
						console.error(
							`Failed to upload PDF ${pdf.name} after ${maxAttempts} attempts`,
						);
						failedUploads.push(pdf.name);
					}
				} catch (error) {
					console.error(`Error processing ${pdf.name}:`, error);
					failedUploads.push(pdf.name);
				} finally {
					// Cleanup: delete the temporary file regardless of upload success or failure
					try {
						const pdfPath = path.join(os.tmpdir(), pdf.name);
						await fs.unlink(pdfPath);
						console.log(`Deleted temporary PDF file: ${pdfPath}`);
					} catch (cleanupError) {
						console.error(
							`Failed to delete temporary PDF file for ${pdf.name}:`,
							cleanupError,
						);
					}
				}
			}

			if (failedUploads.length > 0) {
				throw new Error(
					`Failed to upload the following PDFs: ${failedUploads.join(", ")}`,
				);
			}
			console.log("All PDFs uploaded successfully");
		} else {
			console.log("No PDFs to upload");
		}
	}

	async function uploadPdfUsingFetch(
		page: Page,
		url: string,
		refererUrl: string,
		pdfData: Buffer,
		pdfName: string,
		token: string,
	): Promise<UploadResult> {
		console.log(
			`PDF data size before passing to page: ${pdfData.length} bytes`,
		);

		return await page.evaluate(
			async ({ url, refererUrl, pdfName, pdfData, token }) => {
				console.log(`PDF data size in page context: ${pdfData.length} bytes`);

				if (pdfData.length === 0) {
					console.error("No PDF data received in page context");
					return { success: false, message: "No PDF data received" };
				}

				const blob = new Blob([new Uint8Array(pdfData)], {
					type: "application/pdf",
				});
				console.log(`Created Blob with size: ${blob.size} bytes`);

				const formData = new FormData();
				formData.append("names[0]", pdfName);
				formData.append("craOnly[0]", "false");
				formData.append("includeWithReport[0]", "true");
				formData.append("reportLayoutTypes[0]", "backgroundCheck");
				formData.append("files[0]", blob, pdfName);

				console.log("FormData created successfully");

				try {
					console.log("Attempting upload with fetch...");
					console.log("URL: ", url);
					console.log("Referer URL: ", refererUrl);

					const response = await fetch(url, {
						method: "POST",
						body: formData,
						credentials: "include",
						headers: {
							accept: "application/json, text/plain, */*",
							referer: refererUrl,
							"accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
							"sec-fetch-dest": "empty",
							"sec-fetch-mode": "cors",
							"sec-fetch-site": "same-origin",
							token: token,
						},
					});

					console.log(`Fetch response status: ${response.status}`);

					const result = await response.text();

					if (!response.ok) {
						console.error(
							`HTTP error! status: ${response.status}, response:`,
							result,
						);
						return {
							success: false,
							message: `Upload failed with status ${response.status}`,
							result,
						};
					}

					if (result === "" || result === undefined) {
						console.warn("Server returned an empty response");
						return {
							success: true,
							message:
								"Upload possibly successful, but server returned empty response",
							result: null,
						};
					}

					console.log("Upload result:", result);
					return { success: true, message: "Upload successful", result };
				} catch (error) {
					console.error("Error in uploadPdfUsingFetch:", error);
					return { success: false, message: error.message };
				}
			},
			{
				url,
				refererUrl,
				pdfName,
				pdfData: Array.from(new Uint8Array(pdfData)),
				token,
			},
		);
	}

	try {
		await uploadPDFs(pdfsForUpload, url, refererUrl, token, page);
	} catch (error: unknown) {
		throw Error(
			"Error in PDF upload process. Check that the report is not already completed, as files cannot be uploaded to completed reports. Error message:",
			error.message,
		);
		// Handle the error as needed (e.g., notify user, log to a file, etc.)
	}

	// SECTION_ SEARCH GROUP DETECTION

	// This regex will match the search group which contains the vID search
	// It will match the begining of the string, or any character that is not a
	// word character, followed by the text vID, and then the end of the string
	// or any character that is not a word character.
	const searchGroup = await page
		.locator(".search-group")
		.filter({ hasText: /(^|[^w])vID($|[^w])/ });

	const statusSuccess = await searchGroup
		.locator("div.status-success")
		.isVisible();

	if (statusSuccess) {
		console.log("Search already completed.");
	} else {
		console.log("Marking search as completed.");

		await searchGroup.locator('a[href*="javascript:openSearchEditor"]').click();
		// Listen for dialog events
		page.on("dialog", async (dialog) => {
			console.log(
				`Got dialog "${dialog.type()}" with message: ${dialog.message()}`,
			);

			// Handle different types of dialogs
			switch (dialog.type()) {
				case "alert":
					console.log("Accepting alert");
					await dialog.accept(); // Accept alert
					break;
				case "confirm":
					console.log("Accepting confirm");
					await dialog.accept(); // Accept confirm dialog
					break;
				default:
					console.log("Dismissing dialog");
					await dialog.dismiss(); // Dismiss any other type of dialog
			}
		});

		await page.waitForSelector("#editor-area");

		// If the search is already dispatched, we need to cancel it.
		// We have to cancel the dispatch to be able to mark the search as complete
		// Just one of the TazWorks quirks
		if (await page.getByText("Cancel Dispatch").isVisible()) {
			console.log("Cancelling dispatch");
			await page.getByText("Cancel Dispatch").click();
		}

		// In some cases, the "No Reportable Records Found" radio button doesn't appear
		// Note that canceling the dispatch causes a page reload, so we need to wait for the select option to reappear
		const noRecordsSelector = 'label:has-text("No Reportable Records Found")';

		try {
			await page.waitForSelector(noRecordsSelector, { timeout: 10000 });
			console.log("Marking search as no records found");
			await page.locator(noRecordsSelector).click();
		} catch (e) {
			// If the "No Reportable Records Found" radio button is not found we can safely ignore the error
			console.log("'No Reportable Records' option not found");
		}

		const statusSelect = await page.locator(
			'select[name="orderSearch.status"]',
		);
		console.log("Setting search status to complete");
		await statusSelect.selectOption({ value: "complete" });
		await page.locator(".background-report-table #saveButton").click();

		await delay(2000);
	}

	console.log("SUCCESSFULLY COMPLETED THE PROCESS");

	// Close the Playwright instance
	await tazSdk.close();

	return response;
}
