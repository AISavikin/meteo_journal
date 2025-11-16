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
        // Устанавливаем текущую дату и время по умолчанию
        this.setCurrentDateTime();
        
        document.getElementById('saveBtn').addEventListener('click', 
            () => this.saveEntry());
        
        // Добавляем обработчик Enter для любых полей ввода
        this.addEnterHandlers();
        
        this.renderEntries();
    }

    setCurrentDateTime() {
        const now = new Date();
        // Получаем локальную дату и время в правильном формате
        const localDateTime = this.getLocalDateTimeString(now);
        document.getElementById('datetime').value = localDateTime;
    }

    getLocalDateTimeString(date) {
        // Функция для получения даты в формате YYYY-MM-DDTHH:MM с учетом локального времени
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    addEnterHandlers() {
        const inputs = document.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveEntry();
            });
        });
    }

    saveEntry() {
        const entry = {
            stationNumber: document.getElementById('stationNumber').value.trim(),
            datetime: document.getElementById('datetime').value,
            windSpeed: document.getElementById('windSpeed').value,
            windDirection: document.getElementById('windDirection').value,
            temperature: document.getElementById('temperature').value,
            humidity: document.getElementById('humidity').value,
            pressure: document.getElementById('pressure').value,
            solarRadiation: document.getElementById('solarRadiation').value
        };

        // Проверка обязательных полей
        if (!entry.stationNumber || !entry.datetime) {
            this.showMessage('Заполните номер станции и дату/время', 'error');
            return;
        }

        // Преобразование числовых значений
        const numericFields = ['windSpeed', 'windDirection', 'temperature', 'humidity', 'pressure', 'solarRadiation'];
        for (const field of numericFields) {
            if (entry[field] && entry[field] !== '') {
                const numValue = parseFloat(entry[field]);
                if (isNaN(numValue)) {
                    this.showMessage(`Некорректное значение в поле: ${field}`, 'error');
                    return;
                }
                entry[field] = numValue;
            } else {
                entry[field] = null;
            }
        }

        // Добавляем ID и форматированную дату для отображения
        entry.id = Date.now();
        entry.displayDate = this.formatDisplayDate(entry.datetime);

        this.entries.unshift(entry); // Добавляем в начало
        this.saveToStorage();
        this.renderEntries();
        this.clearForm();
        this.showMessage('Данные успешно записаны!', 'success');
    }

    formatDisplayDate(isoString) {
        // Создаем дату из строки формата YYYY-MM-DDTHH:MM
        // Учитываем, что это локальное время
        const [datePart, timePart] = isoString.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        
        const date = new Date(year, month - 1, day, hours, minutes);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showMessage(text, type) {
        const message = document.createElement('div');
        message.textContent = text;
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#4CAF50' : '#f44336'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: slideDown 0.3s ease;
        `;
        
        document.body.appendChild(message);
        
        setTimeout(() => {
            message.remove();
        }, 3000);
    }

    clearForm() {
        // Очищаем все поля, кроме datetime
        document.getElementById('stationNumber').value = '';
        document.getElementById('windSpeed').value = '';
        document.getElementById('windDirection').value = '';
        document.getElementById('temperature').value = '';
        document.getElementById('humidity').value = '';
        document.getElementById('pressure').value = '';
        document.getElementById('solarRadiation').value = '';
        
        // Устанавливаем текущую дату/время
        this.setCurrentDateTime();
        
        document.getElementById('stationNumber').focus();
    }

    saveToStorage() {
        localStorage.setItem('meteoEntries', JSON.stringify(this.entries));
    }

    renderEntries() {
        const container = document.getElementById('entriesTable');

        if (this.entries.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px;">
                        <div class="empty-state">
                            <div class="empty-state-icon">🌤️</div>
                            <p>Пока нет записей</p>
                            <p><small>Добавьте первую метеозапись</small></p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.entries
            .map(entry => `
                <tr data-id="${entry.id}">
                    <td class="station-number">${this.escapeHtml(entry.stationNumber)}</td>
                    <td>${entry.displayDate}</td>
                    <td>${entry.windSpeed !== null && entry.windSpeed !== undefined ? entry.windSpeed + ' м/с' : '<span class="empty-value">-</span>'}</td>
                    <td>${entry.windDirection !== null && entry.windDirection !== undefined ? entry.windDirection + '°' : '<span class="empty-value">-</span>'}</td>
                    <td class="temperature">${entry.temperature !== null && entry.temperature !== undefined ? entry.temperature + '°C' : '<span class="empty-value">-</span>'}</td>
                    <td class="humidity">${entry.humidity !== null && entry.humidity !== undefined ? entry.humidity + '%' : '<span class="empty-value">-</span>'}</td>
                    <td>${entry.pressure !== null && entry.pressure !== undefined ? entry.pressure + ' гПа' : '<span class="empty-value">-</span>'}</td>
                    <td>${entry.solarRadiation !== null && entry.solarRadiation !== undefined ? entry.solarRadiation + ' Вт/м²' : '<span class="empty-value">-</span>'}</td>
                </tr>
            `)
            .join('');
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '-';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

new MeteoJournal();