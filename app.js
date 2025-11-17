// Регистрация Service Worker с усиленной обработкой ошибок
if ('serviceWorker' in navigator) {
    const swUrl = './service-worker.js';
    
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register(swUrl)
            .then((registration) => {
                console.log('SW registered: ', registration);
                
                // Проверяем обновления
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('New service worker found:', newWorker);
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New content is available; please refresh.');
                        }
                    });
                });
            })
            .catch((registrationError) => {
                console.error('SW registration failed: ', registrationError);
                // Приложение продолжает работать даже без Service Worker
                showPersistentMessage('Предупреждение: некоторые функции офлайн-режима могут быть недоступны', 'warning');
            });
            
        // Обработка ошибок в уже зарегистрированном Service Worker
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('Service Worker controller changed');
        });
    });
} else {
    console.log('Service Worker not supported');
    showPersistentMessage('Ваш браузер не поддерживает все функции приложения', 'warning');
}

// Улучшенный класс MeteoJournal с защитой от всех видов сбоев
class MeteoJournal {
    constructor() {
        this.storage = this.initStorage();
        this.entries = this.storage.get('meteoEntries') || [];
        this.editingId = null;
        this.networkStatus = 'online';
        this.pendingAction = null;
        this.storageWarningShown = false;
        this.init();
    }

    init() {
        try {
            // Устанавливаем текущую дату и время по умолчанию
            this.setCurrentDateTime();
            
            // Безопасная инициализация обработчиков событий
            this.initEventHandlers();
            
            // Инициализируем мониторинг сети
            this.initNetworkMonitoring();
            
            this.renderEntries();
            
            console.log('MeteoJournal initialized successfully');
        } catch (error) {
            console.error('Failed to initialize MeteoJournal:', error);
            this.showMessage('Ошибка инициализации приложения', 'error');
        }
    }

    // Инициализация безопасного хранилища
    initStorage() {
        const memoryStorage = {};
        let storageType = 'memory';
        
        try {
            // Проверяем доступность localStorage
            const testKey = 'storage_test_' + Date.now();
            localStorage.setItem(testKey, 'test');
            const testValue = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            
            if (testValue === 'test') {
                storageType = 'localStorage';
                console.log('Storage: Using localStorage');
            }
        } catch (error) {
            console.warn('LocalStorage not available, checking sessionStorage...');
        }
        
        if (storageType === 'memory') {
            try {
                // Проверяем sessionStorage как fallback
                const testKey = 'storage_test_' + Date.now();
                sessionStorage.setItem(testKey, 'test');
                const testValue = sessionStorage.getItem(testKey);
                sessionStorage.removeItem(testKey);
                
                if (testValue === 'test') {
                    storageType = 'sessionStorage';
                    console.log('Storage: Using sessionStorage');
                }
            } catch (error) {
                console.warn('SessionStorage not available, using memory storage');
            }
        }

        return {
            type: storageType,
            get: (key) => {
                try {
                    switch (storageType) {
                        case 'localStorage':
                            const item = localStorage.getItem(key);
                            return item ? JSON.parse(item) : null;
                        case 'sessionStorage':
                            const sessionItem = sessionStorage.getItem(key);
                            return sessionItem ? JSON.parse(sessionItem) : null;
                        default:
                            return memoryStorage[key] || null;
                    }
                } catch (error) {
                    console.error('Storage get error:', error);
                    return memoryStorage[key] || null;
                }
            },
            set: (key, value) => {
                try {
                    const jsonValue = JSON.stringify(value);
                    
                    switch (storageType) {
                        case 'localStorage':
                            localStorage.setItem(key, jsonValue);
                            break;
                        case 'sessionStorage':
                            sessionStorage.setItem(key, jsonValue);
                            break;
                        default:
                            memoryStorage[key] = value;
                    }
                    
                    // Проверяем, что данные действительно сохранились
                    const retrieved = this.storage.get(key);
                    if (JSON.stringify(retrieved) !== JSON.stringify(value)) {
                        throw new Error('Storage verification failed');
                    }
                    
                    return true;
                } catch (error) {
                    console.error('Storage set error:', error);
                    
                    // Fallback на memory storage
                    if (storageType !== 'memory') {
                        console.warn('Falling back to memory storage');
                        storageType = 'memory';
                        memoryStorage[key] = value;
                        return true;
                    }
                    
                    return false;
                }
            },
            getQuotaInfo: () => {
                if (storageType === 'localStorage') {
                    let total = 0;
                    for (let key in localStorage) {
                        if (localStorage.hasOwnProperty(key)) {
                            total += localStorage[key].length;
                        }
                    }
                    return { type: storageType, used: total, quota: 5 * 1024 * 1024 }; // 5MB typical
                }
                return { type: storageType };
            }
        };
    }

    initEventHandlers() {
        const handlers = [
            { id: 'saveBtn', event: 'click', handler: () => this.saveEntry() },
            { id: 'updateBtn', event: 'click', handler: () => this.updateEntry() },
            { id: 'cancelBtn', event: 'click', handler: () => this.cancelEdit() },
            { id: 'exportBtn', event: 'click', handler: () => this.exportToJson() },
            { id: 'importBtn', event: 'click', handler: () => document.getElementById('importFile').click() },
            { id: 'importFile', event: 'change', handler: (e) => this.importFromJson(e) },
            { id: 'modalCancel', event: 'click', handler: () => this.hideModal() },
            { id: 'modalConfirm', event: 'click', handler: () => this.executeConfirmedAction() }
        ];

        handlers.forEach(({ id, event, handler }) => {
            try {
                const element = document.getElementById(id);
                if (element) {
                    element.addEventListener(event, handler);
                } else {
                    console.warn(`Element with id '${id}' not found`);
                }
            } catch (error) {
                console.error(`Failed to add event handler for ${id}:`, error);
            }
        });

        // Обработчики Enter для полей ввода
        this.addEnterHandlers();
    }

    setCurrentDateTime() {
        try {
            const now = new Date();
            const localDateTime = this.getLocalDateTimeString(now);
            const datetimeInput = document.getElementById('datetime');
            if (datetimeInput) {
                datetimeInput.value = localDateTime;
            }
        } catch (error) {
            console.error('Failed to set current datetime:', error);
        }
    }

    getLocalDateTimeString(date) {
        try {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        } catch (error) {
            console.error('Failed to format datetime:', error);
            // Fallback to current time in basic format
            return new Date().toISOString().slice(0, 16);
        }
    }

    addEnterHandlers() {
        try {
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
        } catch (error) {
            console.error('Failed to add Enter handlers:', error);
        }
    }

    // Улучшенный мониторинг сети
    initNetworkMonitoring() {
        const connectionQuality = document.getElementById('connectionQuality');
        if (!connectionQuality) return;

        const checkConnectionQuality = async () => {
            if (!navigator.onLine) {
                this.setNetworkStatus('offline');
                return;
            }

            try {
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('timeout')), 5000)
                );

                const fetchPromise = fetch('./?cacheBust=' + Date.now(), {
                    method: 'HEAD',
                    cache: 'no-cache',
                    credentials: 'omit'
                }).catch(() => { throw new Error('fetch failed'); });

                const startTime = performance.now();
                await Promise.race([fetchPromise, timeoutPromise]);
                const latency = performance.now() - startTime;

                this.setNetworkStatus(latency > 2000 ? 'slow' : 'online');
            } catch (error) {
                this.setNetworkStatus('offline');
            }
        };

        // События изменения состояния сети
        window.addEventListener('online', () => {
            setTimeout(checkConnectionQuality, 1000);
        });

        window.addEventListener('offline', () => {
            this.setNetworkStatus('offline');
        });

        // Периодическая проверка
        setInterval(checkConnectionQuality, 30000);

        // Первая проверка
        setTimeout(checkConnectionQuality, 2000);

        // Ручная проверка по клику
        connectionQuality.addEventListener('click', () => {
            connectionQuality.setAttribute('data-tooltip', 'Проверка...');
            checkConnectionQuality();
        });
    }

    setNetworkStatus(status) {
        if (this.networkStatus === status) return;
        
        this.networkStatus = status;
        const offlineStatus = document.getElementById('offlineStatus');
        const connectionQuality = document.getElementById('connectionQuality');

        if (!offlineStatus || !connectionQuality) return;

        switch (status) {
            case 'offline':
                offlineStatus.textContent = '🔌 Офлайн-режим';
                offlineStatus.className = 'offline-status show';
                connectionQuality.className = 'connection-quality offline';
                connectionQuality.innerHTML = '🔌';
                connectionQuality.setAttribute('data-tooltip', 'Нет подключения к интернету');
                break;
                
            case 'slow':
                offlineStatus.textContent = '🐌 Медленное соединение';
                offlineStatus.className = 'offline-status show online';
                connectionQuality.className = 'connection-quality slow';
                connectionQuality.innerHTML = '🐌';
                connectionQuality.setAttribute('data-tooltip', 'Медленное интернет-соединение');
                setTimeout(() => {
                    if (this.networkStatus === 'slow') {
                        offlineStatus.classList.remove('show');
                    }
                }, 3000);
                break;
                
            case 'online':
                offlineStatus.textContent = '✅ Соединение восстановлено';
                offlineStatus.className = 'offline-status show online';
                connectionQuality.className = 'connection-quality online';
                connectionQuality.innerHTML = '📶';
                connectionQuality.setAttribute('data-tooltip', 'Стабильное соединение');
                setTimeout(() => {
                    if (this.networkStatus === 'online') {
                        offlineStatus.classList.remove('show');
                    }
                }, 2000);
                break;
        }
    }

    saveEntry() {
        try {
            const entry = {
                stationNumber: document.getElementById('stationNumber')?.value.trim() || '',
                datetime: document.getElementById('datetime')?.value || '',
                windSpeed: document.getElementById('windSpeed')?.value,
                windDirection: document.getElementById('windDirection')?.value,
                temperature: document.getElementById('temperature')?.value,
                humidity: document.getElementById('humidity')?.value,
                pressure: document.getElementById('pressure')?.value,
                solarRadiation: document.getElementById('solarRadiation')?.value
            };

            // Валидация обязательных полей
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

            // Добавляем ID и форматированную дату
            entry.id = Date.now();
            entry.displayDate = this.formatDisplayDate(entry.datetime);

            this.entries.unshift(entry);
            
            // Сохраняем с проверкой успешности
            const saveSuccess = this.saveToStorage();
            this.renderEntries();
            this.clearForm();
            
            if (saveSuccess) {
                this.showMessage('Данные успешно записаны!', 'success');
            } else {
                this.showMessage('Данные записаны временно (проблема с хранилищем)', 'warning');
            }
        } catch (error) {
            console.error('Save entry error:', error);
            this.showMessage('Ошибка при сохранении записи', 'error');
        }
    }

    updateEntry() {
        if (!this.editingId) return;

        try {
            const entryIndex = this.entries.findIndex(entry => entry.id === this.editingId);
            if (entryIndex === -1) {
                this.showMessage('Запись не найдена', 'error');
                this.cancelEdit();
                return;
            }

            const updatedEntry = {
                stationNumber: document.getElementById('stationNumber')?.value.trim() || '',
                datetime: document.getElementById('datetime')?.value || '',
                windSpeed: document.getElementById('windSpeed')?.value,
                windDirection: document.getElementById('windDirection')?.value,
                temperature: document.getElementById('temperature')?.value,
                humidity: document.getElementById('humidity')?.value,
                pressure: document.getElementById('pressure')?.value,
                solarRadiation: document.getElementById('solarRadiation')?.value
            };

            if (!updatedEntry.stationNumber || !updatedEntry.datetime) {
                this.showMessage('Заполните номер станции и дату/время', 'error');
                return;
            }

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

            updatedEntry.id = this.editingId;
            updatedEntry.displayDate = this.formatDisplayDate(updatedEntry.datetime);

            this.entries[entryIndex] = updatedEntry;
            
            const saveSuccess = this.saveToStorage();
            this.renderEntries();
            this.cancelEdit();
            
            if (saveSuccess) {
                this.showMessage('Запись успешно обновлена!', 'success');
            } else {
                this.showMessage('Запись обновлена временно (проблема с хранилищем)', 'warning');
            }
        } catch (error) {
            console.error('Update entry error:', error);
            this.showMessage('Ошибка при обновлении записи', 'error');
        }
    }

    editEntry(id) {
        try {
            const entry = this.entries.find(entry => entry.id === id);
            if (!entry) {
                this.showMessage('Запись не найдена', 'error');
                return;
            }

            // Заполняем форму данными записи
            const fields = {
                'stationNumber': entry.stationNumber,
                'datetime': entry.datetime,
                'windSpeed': entry.windSpeed,
                'windDirection': entry.windDirection,
                'temperature': entry.temperature,
                'humidity': entry.humidity,
                'pressure': entry.pressure,
                'solarRadiation': entry.solarRadiation
            };

            Object.entries(fields).forEach(([field, value]) => {
                const element = document.getElementById(field);
                if (element) {
                    element.value = value || '';
                }
            });

            // Переключаем в режим редактирования
            this.editingId = id;
            document.querySelector('.primary-actions').style.display = 'none';
            document.querySelector('.edit-actions').style.display = 'flex';
            document.querySelector('.secondary-actions').style.display = 'none';

            // Прокручиваем к форме
            document.querySelector('.card')?.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            console.error('Edit entry error:', error);
            this.showMessage('Ошибка при редактировании записи', 'error');
        }
    }

    cancelEdit() {
        this.editingId = null;
        const primaryActions = document.querySelector('.primary-actions');
        const editActions = document.querySelector('.edit-actions');
        const secondaryActions = document.querySelector('.secondary-actions');
        
        if (primaryActions) primaryActions.style.display = 'block';
        if (editActions) editActions.style.display = 'none';
        if (secondaryActions) secondaryActions.style.display = 'grid';
        
        this.clearForm();
    }

    deleteEntry(id) {
        this.showConfirmModal(
            'Удаление записи',
            'Вы уверены, что хотите удалить эту запись? Это действие нельзя отменить.',
            () => {
                try {
                    this.entries = this.entries.filter(entry => entry.id !== id);
                    const saveSuccess = this.saveToStorage();
                    this.renderEntries();
                    
                    if (saveSuccess) {
                        this.showMessage('Запись успешно удалена!', 'success');
                    } else {
                        this.showMessage('Запись удалена временно (проблема с хранилищем)', 'warning');
                    }
                } catch (error) {
                    console.error('Delete entry error:', error);
                    this.showMessage('Ошибка при удалении записи', 'error');
                }
            }
        );
    }

    exportToJson() {
        try {
            // Проверяем поддержку необходимых API
            if (typeof Blob === 'undefined') {
                this.showMessage('Экспорт не поддерживается в этом браузере', 'error');
                return;
            }

            const dataStr = JSON.stringify(this.entries, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            // Создаем URL для скачивания
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `meteo-journal-${new Date().toISOString().slice(0, 10)}.json`;
            
            // Безопасное скачивание
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Освобождаем память
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            this.showMessage('Данные успешно экспортированы!', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Ошибка при экспорте данных', 'error');
        }
    }

    importFromJson(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Проверяем размер файла (максимум 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showMessage('Файл слишком большой (максимум 10MB)', 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                // Валидация структуры данных
                if (!Array.isArray(importedData)) {
                    throw new Error('Некорректный формат данных: ожидался массив');
                }

                // Проверяем обязательные поля
                const requiredFields = ['stationNumber', 'datetime'];
                for (let i = 0; i < importedData.length; i++) {
                    const entry = importedData[i];
                    for (const field of requiredFields) {
                        if (!entry.hasOwnProperty(field)) {
                            throw new Error(`Запись ${i+1}: отсутствует обязательное поле: ${field}`);
                        }
                    }
                }

                this.showConfirmModal(
                    'Импорт данных',
                    `Вы собираетесь заменить все текущие данные (${this.entries.length} записей) на импортированные (${importedData.length} записей). Это действие нельзя отменить. Продолжить?`,
                    () => {
                        try {
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
                            const saveSuccess = this.saveToStorage();
                            this.renderEntries();
                            
                            if (saveSuccess) {
                                this.showMessage('Данные успешно импортированы!', 'success');
                            } else {
                                this.showMessage('Данные импортированы временно (проблема с хранилищем)', 'warning');
                            }
                            
                            event.target.value = '';
                        } catch (error) {
                            console.error('Import processing error:', error);
                            this.showMessage('Ошибка при обработке импортированных данных', 'error');
                            event.target.value = '';
                        }
                    }
                );
            } catch (error) {
                console.error('Import validation error:', error);
                this.showMessage(`Ошибка импорта: ${error.message}`, 'error');
                event.target.value = '';
            }
        };
        
        reader.onerror = () => {
            this.showMessage('Ошибка чтения файла', 'error');
            event.target.value = '';
        };
        
        reader.readAsText(file);
    }

    showConfirmModal(title, message, confirmCallback) {
        try {
            const modalTitle = document.getElementById('modalTitle');
            const modalMessage = document.getElementById('modalMessage');
            const modal = document.getElementById('confirmModal');
            
            if (modalTitle && modalMessage && modal) {
                modalTitle.textContent = title;
                modalMessage.textContent = message;
                modal.style.display = 'flex';
                this.pendingAction = confirmCallback;
            }
        } catch (error) {
            console.error('Show modal error:', error);
            // Если модальное окно не работает, выполняем действие сразу с подтверждением
            if (confirm(message)) {
                confirmCallback();
            }
        }
    }

    hideModal() {
        try {
            const modal = document.getElementById('confirmModal');
            if (modal) {
                modal.style.display = 'none';
            }
            this.pendingAction = null;
        } catch (error) {
            console.error('Hide modal error:', error);
        }
    }

    executeConfirmedAction() {
        if (this.pendingAction) {
            try {
                this.pendingAction();
            } catch (error) {
                console.error('Confirmed action error:', error);
                this.showMessage('Ошибка при выполнении действия', 'error');
            }
        }
        this.hideModal();
    }

    formatDisplayDate(isoString) {
        try {
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
        } catch (error) {
            console.error('Date formatting error:', error);
            return isoString; // Fallback to original string
        }
    }

    showMessage(text, type) {
        try {
            const message = document.createElement('div');
            message.textContent = text;
            message.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : '#dc3545'};
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                animation: slideDown 0.3s ease;
                max-width: 90%;
                text-align: center;
            `;
            
            document.body.appendChild(message);
            
            setTimeout(() => {
                if (message.parentNode) {
                    message.parentNode.removeChild(message);
                }
            }, type === 'warning' ? 5000 : 3000);
        } catch (error) {
            console.error('Show message error:', error);
            // Fallback к alert для критически важных сообщений
            if (type === 'error') {
                alert(text);
            }
        }
    }

    clearForm() {
        try {
            const fields = ['stationNumber', 'windSpeed', 'windDirection', 'temperature', 'humidity', 'pressure', 'solarRadiation'];
            fields.forEach(field => {
                const element = document.getElementById(field);
                if (element) {
                    element.value = '';
                }
            });
            
            this.setCurrentDateTime();
            
            const stationNumberInput = document.getElementById('stationNumber');
            if (stationNumberInput) {
                stationNumberInput.focus();
            }
        } catch (error) {
            console.error('Clear form error:', error);
        }
    }

    saveToStorage() {
        try {
            const success = this.storage.set('meteoEntries', this.entries);
            
            // Показываем предупреждение о проблемах с хранилищем только один раз
            if (!success && !this.storageWarningShown) {
                this.storageWarningShown = true;
                const quotaInfo = this.storage.getQuotaInfo();
                console.warn('Storage issues detected:', quotaInfo);
            }
            
            return success;
        } catch (error) {
            console.error('Save to storage error:', error);
            return false;
        }
    }

    renderEntries() {
        const container = document.getElementById('entriesTable');
        if (!container) return;

        try {
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
        } catch (error) {
            console.error('Render entries error:', error);
            container.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: #dc3545;">
                        Ошибка при отображении данных
                    </td>
                </tr>
            `;
        }
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '-';
        try {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        } catch (error) {
            return unsafe; // Fallback to original string
        }
    }
}

// Глобальная функция для показа постоянных сообщений
function showPersistentMessage(text, type = 'warning') {
    try {
        const existingMessage = document.getElementById('persistent-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const message = document.createElement('div');
        message.id = 'persistent-message';
        message.textContent = text;
        message.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'warning' ? '#ffc107' : '#6c757d'};
            color: ${type === 'warning' ? '#212529' : 'white'};
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 1001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            max-width: 90%;
            text-align: center;
            border: 2px solid ${type === 'warning' ? '#ffa000' : '#545b62'};
        `;

        document.body.appendChild(message);
    } catch (error) {
        console.error('Persistent message error:', error);
    }
}

// Инициализация приложения с обработкой ошибок
try {
    const meteoJournal = new MeteoJournal();
    window.meteoJournal = meteoJournal; // Глобальный доступ для отладки
    
    // Глобальные функции для обработки событий из HTML
    window.editEntry = (id) => meteoJournal.editEntry(id);
    window.deleteEntry = (id) => meteoJournal.deleteEntry(id);
    
    console.log('Application started successfully');
} catch (error) {
    console.error('Failed to start application:', error);
    showPersistentMessage('Критическая ошибка при запуске приложения', 'error');
    
    // Аварийный fallback - показываем базовый интерфейс
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = `
                <div class="card">
                    <h2>Метеожурнал экспедиции</h2>
                    <p>Приложение временно недоступно из-за технических проблем.</p>
                    <button onclick="location.reload()">Перезагрузить</button>
                </div>
            `;
        }
    });
}