// Регистрация Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('SW registered'))
        .catch((err) => console.log('SW registration failed:', err));
}

(() => {
    // Обработка редиректа с 404 страницы
    if (sessionStorage.redirect) {
        const redirect = sessionStorage.redirect;
        delete sessionStorage.redirect;
        if (redirect !== location.href) {
            history.replaceState(null, null, redirect);
        }
    }
})();

// Логика приложения
class MeteoJournal {
    constructor() {
        this.entries = JSON.parse(localStorage.getItem('meteoEntries')) || [];
        this.editingId = null;
        this.init();
    }

    init() {
        // Устанавливаем текущую дату и время по умолчанию
        this.setCurrentDateTime();
        
        // Обработчики для кнопок
        document.getElementById('saveBtn').addEventListener('click', 
            () => this.saveEntry());
        document.getElementById('updateBtn').addEventListener('click', 
            () => this.updateEntry());
        document.getElementById('cancelBtn').addEventListener('click', 
            () => this.cancelEdit());
        document.getElementById('exportBtn').addEventListener('click', 
            () => this.exportToJson());
        document.getElementById('importBtn').addEventListener('click', 
            () => document.getElementById('importFile').click());
        document.getElementById('importFile').addEventListener('change', 
            (e) => this.importFromJson(e));
        
        // Обработчики модального окна
        document.getElementById('modalCancel').addEventListener('click', 
            () => this.hideModal());
        document.getElementById('modalConfirm').addEventListener('click', 
            () => this.executeConfirmedAction());
        
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
                if (e.key === 'Enter') {
                    if (this.editingId) {
                        this.updateEntry();
                    } else {
                        this.saveEntry();
                    }
                }
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

    updateEntry() {
        if (!this.editingId) return;

        const entryIndex = this.entries.findIndex(entry => entry.id === this.editingId);
        if (entryIndex === -1) {
            this.showMessage('Запись не найдена', 'error');
            this.cancelEdit();
            return;
        }

        const updatedEntry = {
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
        if (!updatedEntry.stationNumber || !updatedEntry.datetime) {
            this.showMessage('Заполните номер станции и дату/время', 'error');
            return;
        }

        // Преобразование числовых значений
        const numericFields = ['windSpeed', 'windDirection', 'temperature', 'humidity', 'pressure', 'solarRadiation'];
        for (const field of numericFields) {
            if (updatedEntry[field] && updatedEntry[field] !== '') {
                const numValue = parseFloat(updatedEntry[field]);
                if (isNaN(numValue)) {
                    this.showMessage(`Некорректное значение в поле: ${field}`, 'error');
                    return;
                }
                updatedEntry[field] = numValue;
            } else {
                updatedEntry[field] = null;
            }
        }

        // Сохраняем ID и добавляем форматированную дату
        updatedEntry.id = this.editingId;
        updatedEntry.displayDate = this.formatDisplayDate(updatedEntry.datetime);

        // Обновляем запись
        this.entries[entryIndex] = updatedEntry;
        this.saveToStorage();
        this.renderEntries();
        this.cancelEdit();
        this.showMessage('Запись успешно обновлена!', 'success');
    }

    editEntry(id) {
        const entry = this.entries.find(entry => entry.id === id);
        if (!entry) {
            this.showMessage('Запись не найдена', 'error');
            return;
        }

        // Заполняем форму данными записи
        document.getElementById('stationNumber').value = entry.stationNumber || '';
        document.getElementById('datetime').value = entry.datetime || '';
        document.getElementById('windSpeed').value = entry.windSpeed || '';
        document.getElementById('windDirection').value = entry.windDirection || '';
        document.getElementById('temperature').value = entry.temperature || '';
        document.getElementById('humidity').value = entry.humidity || '';
        document.getElementById('pressure').value = entry.pressure || '';
        document.getElementById('solarRadiation').value = entry.solarRadiation || '';

        // Переключаем в режим редактирования
        this.editingId = id;
        document.querySelector('.primary-actions').style.display = 'none';
        document.querySelector('.edit-actions').style.display = 'flex';
        document.querySelector('.secondary-actions').style.display = 'none';

        // Прокручиваем к форме
        document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
    }

    cancelEdit() {
        this.editingId = null;
        document.querySelector('.primary-actions').style.display = 'block';
        document.querySelector('.edit-actions').style.display = 'none';
        document.querySelector('.secondary-actions').style.display = 'grid';
        this.clearForm();
    }

    deleteEntry(id) {
        this.showConfirmModal(
            'Удаление записи',
            'Вы уверены, что хотите удалить эту запись? Это действие нельзя отменить.',
            () => {
                this.entries = this.entries.filter(entry => entry.id !== id);
                this.saveToStorage();
                this.renderEntries();
                this.showMessage('Запись успешно удалена!', 'success');
            }
        );
    }

    exportToJson() {
        const dataStr = JSON.stringify(this.entries, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `meteo-journal-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        this.showMessage('Данные успешно экспортированы!', 'success');
    }

    importFromJson(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                // Проверяем структуру данных
                if (!Array.isArray(importedData)) {
                    throw new Error('Некорректный формат данных');
                }

                // Проверяем, что все элементы имеют нужные поля
                const requiredFields = ['stationNumber', 'datetime'];
                for (const entry of importedData) {
                    for (const field of requiredFields) {
                        if (!entry.hasOwnProperty(field)) {
                            throw new Error(`Отсутствует обязательное поле: ${field}`);
                        }
                    }
                }

                this.showConfirmModal(
                    'Импорт данных',
                    `Вы собираетесь заменить все текущие данные (${this.entries.length} записей) на импортированные (${importedData.length} записей). Это действие нельзя отменить. Продолжить?`,
                    () => {
                        // Обновляем ID и displayDate для импортированных записей
                        const now = Date.now();
                        importedData.forEach((entry, index) => {
                            if (!entry.id) {
                                entry.id = now + index;
                            }
                            if (!entry.displayDate && entry.datetime) {
                                entry.displayDate = this.formatDisplayDate(entry.datetime);
                            }
                        });

                        this.entries = importedData;
                        this.saveToStorage();
                        this.renderEntries();
                        this.showMessage('Данные успешно импортированы!', 'success');
                        
                        // Сбрасываем input файла
                        event.target.value = '';
                    }
                );
            } catch (error) {
                this.showMessage(`Ошибка импорта: ${error.message}`, 'error');
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    showConfirmModal(title, message, confirmCallback) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('confirmModal').style.display = 'flex';
        
        this.pendingAction = confirmCallback;
    }

    hideModal() {
        document.getElementById('confirmModal').style.display = 'none';
        this.pendingAction = null;
    }

    executeConfirmedAction() {
        if (this.pendingAction) {
            this.pendingAction();
        }
        this.hideModal();
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
            background: ${type === 'success' ? '#28a745' : '#dc3545'};
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
                    <td colspan="9" style="text-align: center; padding: 40px;">
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
                    <td class="actions-cell">
                        <button class="btn btn-sm btn-outline" onclick="meteoJournal.editEntry(${entry.id})" title="Редактировать">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="meteoJournal.deleteEntry(${entry.id})" title="Удалить">🗑️</button>
                    </td>
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

// Создаем глобальный экземпляр для доступа из HTML
const meteoJournal = new MeteoJournal();