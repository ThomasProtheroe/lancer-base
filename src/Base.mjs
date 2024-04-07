import * as fs from 'node:fs/promises';
const _rootDir = process.cwd();

export class Base {
	name;
	defenses = {
		defense: 0,
		eDefense: 0,
		sensors: 0
	};
	condition = {
		value: 10,
		max: 10
	};
	morale = {
		value: 5,
		max: 10
	};
	resources = {
		materials: {
			name: 'Materials',
			quantity: 2000
		},
		refinedMaterials: {
			name: 'Refined Materials',
			quantity: 100
		},
		manna: {
			name: 'Manna',
			'quantity': 10000
		}
	};
	addons = [
		{
			name: 'Build Mech',
			category: 'activity',
			description: 'Use the printer to produce a mech that you have a license for.',
			notes: 'A labor intensive process that takes considerable time. Printer quality determines mechs traits.',
			available: 1,
			cost: {
				downtimeUnits: 1,
				materials: 300
			},
			effects: {
				description: 'printed a new mech.',
				mech: true
			}
		},
        {
            name: 'Scavange',
			category: 'activity',
            description: 'Search the ruined sections of the bunker for salvagable materials.',
            notes: 'Slow and monotonous, but free.',
            available: 1,
            cost: {
                downtimeUnits: 1
            },
            effects: {
                description: 'explored more of the facility.',
                resources:{
                    description: 'salvaged some resources from the ruins.',
                    chance: 100,
                    lose: false,
                    modifierPercent: 30,
                    quantities: {
                        materials: 200,
                        refinedMaterials: 10
                    }
                }
            }
        },
        {
            name: 'Other Activity',
			category: 'activity',
            description: 'Use this activity when you need to spend a unit of downtime on anything else, such as training.',
            notes: 'Confirm with the GM before spending downtime.',
            available: 1,
            cost: {
                'downtimeUnits': 1
            },
            effects: {
                'description': 'took some personal time.'
            }
        },
		{
            type: 'printer',
			category: 'facilities',
            flaws: 1,
            qualities: 0,
            name: 'Mech Printer (damaged)',
            description: 'A very old printer that still functions, albeit with some quirks.',
            notes: 'Allows the printing of mechs, weapons and systems. All mechs printed with this printer gain 1 Flaw at random.'
        },
		{
            type: 'defenders',
			category: 'defenses',
            name: 'Local Militia',
            description: 'Local civilians who will take up arms to defend their homes. Untrained and poorly equipped.',
            notes: 'Provides no defensive bonuses.'
        },
        {
            type: 'sensors',
			category: 'defenses',
            sensors: 0,
            name: 'Simple Radar',
            description: 'A somewhat aging radar system designed to pick up vehicle sized targets at ranges of roughly 30 km.',
            notes: 'Gives a short notice of approaching threats. Will not detect infantry or small vehicles.'
        }
	];
	socket;
	constructor(name = 'Blue Haven', socket) {
		this.name = name;
		let fileName = name.toLowerCase();
		fileName = fileName.replace(' ', '_');
		fileName = fileName.replace('\'', '');
		this.filePath = `${_rootDir}/data/${fileName}.json`;
		if (socket) {
			this.socket = socket;
		}
	}

	/**
	 * updateCondition
	 * @param {number} newValue 
	 * @returns {object}
	 */
	updateCondition(newValue) {
		if (newValue < 0) {
			this.condition.value = 0;
		} else if (newValue > this.condition.max) {
			this.condition.value = this.condition.max;
		} else {
			this.condition.value = newValue;
		}
		return this.condition;
	}

	/**
	 * updateMorale
	 * @param {number} newValue 
	 * @returns {object}
	 */
	updateMorale(newValue) {
		if (newValue < 0) {
			this.morale.value = 0;
		} else if (newValue > this.morale.max) {
			this.morale.value = this.morale.max;
		} else {
			this.morale.value = newValue;
		}
		return this.morale;
	}

	/**
	 * updateDefenses
	 * @param {Object} defenses
	 * @param {number} [defenses.defense]
	 * @param {number} [defenses.eDefense]
	 * @param {number} [defenses.sensors]
	 * @returns 
	 */
	updateDefenses({defense, eDefense, sensors}) {
		if (defense) {
			this.defenses.defense = defense;
		}
		if (eDefense) {
			this.defenses.eDefense = eDefense;
		}
		if(sensors) {
			this.defenses.sensors = sensors;
		}

		return this.defenses;
	}

	/**
	 * updateResources
	 * @param {Object} resources
	 * @param {number} [resources.materials]
	 * @param {number} [resources.refinedMaterials]
	 * @param {number} [resources.manna]
	 * @returns 
	 */
	updateResources({materials, refinedMaterials, manna}) {
		if(Number.isInteger(materials)) {
			this.resources.materials.quantity = materials;
		}
		if(Number.isInteger(refinedMaterials)) {
			this.resources.refinedMaterials.quantity = refinedMaterials;
		}
		if(Number.isInteger(manna)) {
			this.resources.manna.quantity = manna;
		}
		if (this.socket) {
			this.socket.emit('resources', this.resources);
		}
		return this.resources;
	}

	/**
	 * addAddon
	 * @param {object} newAddon 
	 * @returns {object[]}
	 */
	addAddon(newAddon) {
		// Make sure the newAddon doesn't already exist
		if (this.addons.find((addOn) => addOn.name === newAddon.name)) {
			return false;
		}

		this.addons.push(newAddon);
		return true;
	}

	updateAddon(updatedAddon) {
		const addOnIndex = this.addons.findIndex((addon) => addon.name === updatedAddon.name);
		if (addOnIndex > -1) {
			this.addons[addOnIndex] = updatedAddon;
		}
		return this.addons;
	}

	async load() {
		try {
			const baseData = JSON.parse(await fs.readFile(this.filePath));
			this.defenses = baseData.defenses;
			this.condition = baseData.condition;
			this.morale = baseData.morale;
			this.resources = baseData.resources;
			this.addons = baseData.addons;
			return baseData;
		} catch(err) {
			console.error(err);
		}
	}

	async save() {
		const baseData = JSON.stringify(this, null, '	');
		try {
			await fs.writeFile(this.filePath, baseData, 'utf8');
		} catch (err) {
			console.error(err);
		}
	}

}