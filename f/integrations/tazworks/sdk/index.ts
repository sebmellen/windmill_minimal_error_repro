//nobundling
import axios from "axios";
import { type Page, chromium } from "playwright";
import { TOTP } from "totp-generator";
import {
	type CraCredential,
	main as getCraCredentials,
} from "/f/integrations/tazworks/get_cra_credentials.ts";

interface Address {
	streetOne: string;
	streetTwo: string | null;
	city: string;
	state: string;
	zipCode: string;
	country: string;
}

interface Client {
	id: number;
	name: string;
	parentId: number | null;
	inquiryName: string;
	substituteEndUser: boolean;
	dateCreated: string;
	code: string;
	contact: string;
	email: string;
	phone: string | null;
	phoneExtension: string | null;
	phoneAlternate: string | null;
	phoneAlternateExtension: string | null;
	fax: string | null;
	faxInstructions: string | null;
	ownercontact: string | null;
	owneremail: string;
	ownerphone: string | null;
	ownerphoneExtension: string | null;
	ownerphoneAlternate: string | null;
	ownerphoneAlternateExtension: string | null;
	status: string;
	disabledReason: string | null;
	disabledMessage: string | null;
	physicalAddress: Address;
	billingAddress: Address;
	billingSameAs: boolean;
	addressCareOf: string | null;
	displayInstructions: boolean;
	instructions: string | null;
	notes: string | null;
	preferredDomain: string | null;
	doNotApplyPreferredUrlToInvoice: boolean;
	copyClientId: number | null;
	copySections: string | null;
	createdByUser: string;
	modifiedBy: string;
	dateModified: number;
	guid: string;
	parentName: string | null;
	copyClientGuid: string | null;
}

interface ClientProduct {
	clientProductGuid: string;
	productGuid: string;
	productName: string;
	dateModified: number;
	modifiedBy: string;
	usesQuickapp: boolean;
}

const setupBrowser = async () => {
	const browser = await chromium.launch({
		// biome-ignore lint/complexity/useLiteralKeys: https://www.typescriptlang.org/docs/handbook/2/objects.html#index-signatures
		headless: process.env["PLAYWRIGHT_HEADED"] !== "true",
		executablePath:
			process.env.NODE_ENV === "local" ? undefined : "/usr/bin/chromium",
		args: ["--no-sandbox"],
	});

	const context = await browser.newContext({
		userAgent:
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/122.0.2365.106",
	});

	const page = await context.newPage();

	// allow console.log statements inside page.evaluate
	page.on("console", async (msg) => {
		const msgArgs = msg.args();

		for (const arg of msgArgs) {
			const message = await arg.jsonValue();
			if (typeof message === "string") {
				if (!message.includes("JQMIGRATE")) {
					console.log(message);
				}
			}
		}
	});

	return { browser, context, page };
};

export class TazWorksSDK {
	protected initialized = false;
	protected credentials: CraCredential | null = null;
	private craGuid: string;
	private browser: chromium.Browser | null = null;
	private context: chromium.BrowserContext | null = null;
	private page: Page | null = null;

	constructor(craGuid: string) {
		this.craGuid = craGuid;
	}

	private initGuard(): asserts this is {
		initialized: true;
		credentials: CraCredential;
	} {
		if (!this.initialized) {
			throw new Error("SDK not initialized. Call init() first.");
		}
	}

	public async init() {
		this.credentials = await getCraCredentials(this.craGuid);
		if (!this.credentials) {
			throw new Error(
				`Cannot find stored SOPS credentials for cra: ${this.craGuid}`,
			);
		}
		this.initialized = true;
	}

	public async login(existingPage?: Page): Promise<Page> {
		this.initGuard();
		if (existingPage) {
			this.page = existingPage;
		} else {
			const { browser, context, page } = await setupBrowser();
			this.browser = browser;
			this.context = context;
			this.page = page;
		}
		const { baseCraUrl, vidBotAuth } = this.credentials;

		await this.page.goto(`${baseCraUrl}/sso/login.taz`);

		// LOGIN PAGE
		await this.page.locator("#l-name").fill(vidBotAuth.username);
		await this.page.locator("#l-pass").fill(vidBotAuth.password);
		await this.page.click("#l-btn");
		await this.page.waitForURL("**/sso/mfa.taz");

		// Generate OTP code
		const { otp } = TOTP.generate(vidBotAuth.totpCode);

		await this.page.locator("#code").fill(otp);

		await this.page.getByText("Verify", { exact: true }).click();

		await this.page.waitForURL(`${baseCraUrl}/is/app`);

		console.log("SDK: MFA Complete");

		return this.page;
	}

	public getBaseCraUrl(): string {
		this.initGuard();
		return this.credentials.baseCraUrl;
	}

	/**
	 * Get a single TazWorks client by clientGuid
	 *
	 * TazWorks has an API endpoint for retrieving a single client, but we can't
	 * get access to it. This method is a workaround to scrape the client data
	 * from the client edit page. Access to this page requires the vidbot user
	 * to have the "View client setup" permission.
	 * We've kept the return type the same as the API endpoint for consistency.
	 * See https://docs.developer.tazworks.com/#3a09caba-349b-4969-a55a-1cbcaea0136c
	 *
	 * @param clientGuid
	 * @param existingPage
	 * @returns object - client object
	 */
	public async getClient(
		clientGuid: string,
		existingPage?: Page,
	): Promise<Client> {
		this.initGuard();
		const page = existingPage ?? (await this.login());
		const baseCraUrl = this.getBaseCraUrl();
		await page.goto(
			`${baseCraUrl}/is/app/admin/clients/clients/${clientGuid}/edit/general`,
		);

		const response = await page.waitForResponse(
			`https://www.petsafespot.net/ui/v1/clients/${clientGuid}/general.json`,
		);
		return response.json() as Promise<Client>;
	}

	public async getClientProducts(clientGuid: string): Promise<ClientProduct[]> {
		this.initGuard();
		const { craApiKey } = this.credentials;
		const products = [];
		let page = 0;
		let data: ClientProduct[] = [];
		do {
			const response = await axios.get(
				`https://api.instascreen.net/v1/clients/${clientGuid}/products?page=${page}&size=30`,
				{
					headers: {
						Authorization: `Bearer ${craApiKey}`,
					},
				},
			);
			products.push(...response.data);
			data = response.data;
			page++;
		} while (data.length === 30);

		return products;
	}

	public async close(): Promise<void> {
		if (this.page) {
			await this.page.close();
			this.page = null;
		}
		if (this.context) {
			await this.context.close();
			this.context = null;
		}
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}
}
