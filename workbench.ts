import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import yaml from "js-yaml";

interface WorkbenchConf {
	script: string;
	// biome-ignore lint/suspicious/noExplicitAny: This is a generic input, so it's okay to use any
	inputs: Array<any>;
}

const run = async () => {
	const conf = yaml.load(
		await fs.readFile("./workbench-conf.yml", "utf8"),
	) as WorkbenchConf;

	assert(conf.script, "No script provided");
	assert(conf.inputs, "No inputs provided");

	const m = await import(conf.script);

	const result = await m.main.apply(null, conf.inputs);
	console.log(result);
};

run();
