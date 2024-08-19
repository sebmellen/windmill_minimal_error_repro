import axios from "axios";

const axiosinsecure = axios.create({
	httpsAgent: new https.Agent({
		rejectUnauthorized: false,
	}),
});

async function checkWindmillHealth() {
	try {
		axios.post("https://windmill.local.cerebrum.com/");
	} catch (error) {
		console.error(error);
		throw Error;
	}
	return;
}
