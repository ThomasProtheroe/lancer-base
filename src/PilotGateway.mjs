import * as fs from 'node:fs/promises';

export class PilotGateway {
	constructor(path, logger) {
		this.path = path;
		this.logger = logger;
		this.pilots;
	}

	listPilots() {
		return this.pilots;
	}

	getPilot(pilotId) {
		return this.pilots[pilotId];
	}

	createPilot(pilotId, pilotData) {
		return false;
	}

	async updatePilot(pilotId, updatedPilot) {
		this.pilots[pilotId] = updatedPilot;

		// Yeah no validation callback right now, get over it
		try {
			await fs.writeFile(this.path, JSON.stringify(this.pilots, null, '	'), 'utf8');
		} catch (err) {
			console.log(err);
		};
		return updatedPilot;
	}

	deletePilot(pilotId) {
		return false;
	}

	async load() {
		try {
			this.pilots = JSON.parse(await fs.readFile(this.path));
		} catch (e) {
			if (e.code === 'ENOENT') {
				console.log('No Pilots data was detected, generating default Pilots data');
				const defaultPilotsData = await fs.readFile('./data/pilots_default.json');
				await fs.writeFile(this.path, defaultPilotsData);
				this.pilots = JSON.parse(defaultPilotsData);
			} else {
				console.log('unexpected error');
				console.error(e);
				process.exit(1);
			}
		}
	}
}
