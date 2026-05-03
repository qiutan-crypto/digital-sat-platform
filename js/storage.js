class StorageManager {
    static STORAGE_KEY = 'sat_test_history';

    static saveTestResult(result) {
        const history = this.getHistory();
        history.push({
            id: Date.now().toString(),
            date: new Date().toISOString(),
            ...result
        });
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    }

    static getHistory() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    static getResultById(id) {
        const history = this.getHistory();
        return history.find(r => r.id === id);
    }
}
