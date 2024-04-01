import * as fs from 'node:fs/promises';

export class ActivityLog {
    constructor (path, socket) {
        this.path = path;
        this.socket = socket;
        this.logs = null;
    }

    getLogs() {
        return this.logs;
    }

    getLog() {
        return false;
    }

    async createLog(user, message) {
        const log = {
            user,
            time: Date.now(),
            message
        };
        this.logs.push(log);
        if (this.socket) {
            this.socket.emit('activity_log', log);
        }
        try {
            await fs.writeFile(this.path, JSON.stringify(this.logs, null, "    "));
        } catch (err) {
            console.log('error: ', err);
            console.log('Failed to write logs to file, dumping contents');
            console.log(this.logs);
        }
        return log;
    }

    updateLog(){
        return false;
    }

    deleteLog(){
        return false;
    }

    async load() {
        try {
            return this.logs = JSON.parse(await fs.readFile(this.path));
        } catch(e) {
            if (e.code === 'ENOENT') {
                console.log('No Activity Log detected, generating default Activity Log');
                await fs.writeFile(this.path, JSON.stringify([], null, '	'));
                return this.logs = [];
            } else {
                console.log('unexpected error');
                console.error(e);
                process.exit(1);
            }
        }
    }
}
