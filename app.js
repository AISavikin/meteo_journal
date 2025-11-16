// Регистрация Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('SW registered'))
        .catch((err) => console.log('SW registration failed:', err));
}

// Логика приложения
class MeteoJournal {
    constructor() {
        this.entries = JSON.parse(localStorage.getItem('meteoEntries')) || [];
        this.init();
    }

    init() {
        document.getElementById('saveBtn').addEventListener('click', 
            () => this.saveEntry());
        this.renderEntries();
    }

    saveEntry() {
        const station = document.getElementById('station').value.trim();
        const temperature = document.getElementById('temperature').value;

        if (!station || !temperature) {
            alert('Заполните все поля');
            return;
        }

        const entry = {
            station,
            temperature: parseFloat(temperature),
            timestamp: new Date().toLocaleString('ru-RU')
        };

        this.entries.push(entry);
        this.saveToStorage();
        this.renderEntries();
        this.clearForm();
    }

    clearForm() {
        document.getElementById('station').value = '';
        document.getElementById('temperature').value = '';
    }

    saveToStorage() {
        localStorage.setItem('meteoEntries', JSON.stringify(this.entries));
    }

    renderEntries() {
        const container = document.getElementById('entries');
        container.innerHTML = this.entries
            .map(entry => `
                <div class="entry">
                    <strong>${entry.station}</strong>: ${entry.temperature}°C<br>
                    <small>${entry.timestamp}</small>
                </div>
            `)
            .reverse()
            .join('');
    }
}

new MeteoJournal();