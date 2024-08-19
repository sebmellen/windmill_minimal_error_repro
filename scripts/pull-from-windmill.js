import { execa } from "execa";

async function pullFromWindmill(token) {
	console.log("Script started.");

	const windmillUrl = "https://windmill.local.cerebrum.com";

	console.log(token);

	try {
		// Pull from Windmill every second
		setInterval(async () => {
			try {
				await execa("wmill sync pull", { stdout: "ignore", shell: true });
				console.log("Pulled from windmil at ", Date.now);
			} catch (error) {
				console.error("Error pulling from Windmill:", error);
			}
		}, 1000);
	} catch (error) {
		console.error("Error setting up Windmill workspace:", error);
	}
}

await pullFromWindmill(process.env.WINDMILL_TOKEN);
