function createLogTemplate(selectedPilot = null, isGM = false, isZen = false) {
	if (!selectedPilot && !isGM && !isZen) return;

	var userText = () => {
		if (selectedPilot != ''){
			return `<span class="${selectedPilot}_text">${selectedPilot}</span>`
		}
		else if (isGM){
			return `<span class="GM_text">GM</span>`;
		}
		else if (isZen){
			return `<span class="Zen_text">Zen</span>`;
		}
	}

	var logTemplate = `
	<div id="logTemplate" class="row logs-header">
		<h2 class="addon-header">Game Logs</h2>
	</div>
	<div class="row">
		<div id="log-display" class="row">
			{{#each logs}}
				<div>
					<span class="{{user}}_text">[{{ user }}]</span> - {{ message }}
				</div>
			{{/each}}
		</div>
	</div>
	<div id="log-input" class="row">
		<div>
			${userText()}
			<span>:~$ </span>
		</div>
		<div>
			<input id="log-text-input" type="text"/>
		</div>
	</div>`;

	return logTemplate;
}

async function sendMessage(e) {
	if (e.code == "Enter" || e.code == "NumpadEnter"){
		var user = parent.state.selectedPilot != '' ? parent.state.selectedPilot
					: parent.state.isGM ? "GM" : "Zen";
		const message = {
			user: user,
			time: Date.now(),
			message: this.value
		};
		await fetch('./log', {
			method: 'POST',
			body: JSON.stringify(message),
			headers: {
				"Content-type": "application/json; charset=UTF-8"
			}
		});
	}
}

function addLog(log) {
	this.state.logs.push(log);
	renderLogs();
}

function renderLogs() {
	const logs = this.state.logs;
	const selectedPilot = this.state.selectedPilot;
	var isGM = this.state.isGM;
	var isZen = this.state.isZen;
	const source = createLogTemplate(selectedPilot, isGM, isZen);
	const template = Handlebars.compile(source);
	const rendered = template({ logs, selectedPilot});
	var logContainer = document.getElementById('log-container');
	logContainer.innerHTML = rendered;
	logContainer.scrollTop = logContainer.scrollHeight;
	document.getElementById('log-container').innerHTML = rendered;
	var logInput = document.getElementById("log-text-input");
	logInput.onkeydown = sendMessage;
}