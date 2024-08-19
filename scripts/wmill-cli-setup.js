import { $ } from "execa";

export async function windmillPushSync(token) {
	const windmillUrl = "https://windmill.local.cerebrum.com";

	console.log(token);

	await $`wmill workspace add integrations integrations ${windmillUrl} --token=${token}`;

	await $`wmill workspace switch integrations`;

	const { stdout: workspace } = await $`wmill workspace`;

	console.log(workspace);
}
