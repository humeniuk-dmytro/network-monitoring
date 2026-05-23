// Functions for adding, editing, and deleting devices

// Assuming addDeviceForm, deviceNameInput, deviceIpInput, displayError, fetchAllDevices are global or correctly scoped
/* 
ВИДАЛЕНО БЛОК З addDeviceForm.addEventListener('submit', ...)

if (typeof addDeviceForm !== 'undefined' && addDeviceForm) {
    addDeviceForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const name = deviceNameInput.value.trim();
        const ip_address = deviceIpInput.value.trim();
        if (!name || !ip_address) {
            displayError("Ім'я та IP-адреса не можуть бути порожніми.");
            return;
        }

        const snmp_enabled = document.getElementById('addSnmpEnabled').checked;
        let snmp_version = document.getElementById('addSnmpVersion').value;
        const snmp_community = document.getElementById('addSnmpCommunity').value.trim();
        let snmp_port = document.getElementById('addSnmpPort').value.trim();

        const payload = { name, ip_address };
        if (snmp_enabled) {
            payload.snmp_enabled = true;
            payload.snmp_version = snmp_version ? parseInt(snmp_version) : null;
            payload.snmp_community = snmp_community;
            payload.snmp_port = snmp_port ? parseInt(snmp_port) : 161;
        } else {
            payload.snmp_enabled = false;
            payload.snmp_version = null;
            payload.snmp_community = null;
            payload.snmp_port = null; 
        }

        try {
            const response = await fetch('/api/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
            
            await fetchAllDevices(); 
            deviceNameInput.value = '';
            deviceIpInput.value = '';
            // Clear SNMP fields in add form
            document.getElementById('addSnmpEnabled').checked = false;
            document.getElementById('addSnmpVersion').value = "2"; // Default back to v2c or empty
            document.getElementById('addSnmpCommunity').value = "";
            document.getElementById('addSnmpPort').value = "161";

            displayError("");
            // Оновлюємо глобальну статистику
            if (typeof window.triggerGlobalStatsUpdate === 'function') {
                window.triggerGlobalStatsUpdate();
            }
        } catch (error) {
            console.error("Помилка додавання пристрою:", error);
            displayError("Не вдалося додати пристрій: " + error.message);
        }
    });
} else {
    // console.warn("addDeviceForm not found, skipping event listener attachment.")
}
*/

async function deleteDevice(deviceId, deviceName) {
    if (!confirm(`Ви впевнені, що хочете видалити пристрій "${deviceName}" (ID: ${deviceId})?`)) return;
    try {
        const response = await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);
        alert(result.message);
        await fetchAllDevices(); // fetchAllDevices from uiUpdater.js
        displayError(""); // displayError from uiUpdater.js
        // Оновлюємо глобальну статистику
        if (typeof window.triggerGlobalStatsUpdate === 'function') {
            window.triggerGlobalStatsUpdate();
        }
    } catch (error) {
        console.error("Помилка видалення пристрою:", error);
        const errorMsg = "Не вдалося видалити пристрій: " + error.message;
        displayError(errorMsg);
        alert(errorMsg);
    }
}

async function fetchDeviceDetails(deviceId) {
    try {
        const response = await fetch(`/api/devices/${deviceId}`);
        if (!response.ok) {
            console.error(`Помилка завантаження деталей пристрою ${deviceId}: ${response.status}`);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error(`Помилка завантаження деталей пристрою ${deviceId}:`, error);
        return null;
    }
}

async function showEditDeviceModal(deviceId, currentName, currentIp, snmp_enabled, snmp_version, snmp_community, snmp_port) {
    document.getElementById('editDeviceId').value = deviceId;
    document.getElementById('editDeviceName').value = currentName;
    document.getElementById('editDeviceIp').value = currentIp;
    document.getElementById('editDeviceModalTitle').textContent = `Редагувати пристрій: ${currentName}`;

    // Оголошуємо змінні для SSH полів тут, щоб вони були в області видимості
    const editSshEnabledCheckbox = document.getElementById('editSshEnabled');
    const editSshCredentialsDiv = document.querySelector('#editDeviceModal .ssh-credentials-edit');
    const editSshUsernameInput = document.getElementById('editSshUsername');
    const editSshPasswordInput = document.getElementById('editSshPassword');

    const deviceFullData = await fetchDeviceDetails(deviceId); 
    if (deviceFullData) {
        document.getElementById('editSnmpEnabled').checked = deviceFullData.snmp_enabled || false;
        document.getElementById('editSnmpVersion').value = deviceFullData.snmp_version || "";
        document.getElementById('editSnmpCommunity').value = deviceFullData.snmp_community || "";
        document.getElementById('editSnmpPort').value = deviceFullData.snmp_port || "161";

        if (editSshEnabledCheckbox) editSshEnabledCheckbox.checked = deviceFullData.ssh_enabled || false;
        if (editSshUsernameInput) editSshUsernameInput.value = deviceFullData.ssh_username || '';
        if (editSshPasswordInput) editSshPasswordInput.value = ''; 

        if (editSshCredentialsDiv) editSshCredentialsDiv.style.display = 'none';
    } else {
        document.getElementById('editSnmpEnabled').checked = snmp_enabled || false; // Fallback to passed params
        document.getElementById('editSnmpVersion').value = snmp_version || "";
        document.getElementById('editSnmpCommunity').value = snmp_community || "";
        document.getElementById('editSnmpPort').value = snmp_port || "161";
        // console.warn("Не вдалося завантажити повні SNMP деталі для редагування, використовуючи передані параметри.");

        // Fallback для SSH, якщо deviceFullData не завантажено (малоймовірно, але для повноти)
        const editSshEnabledCheckbox = document.getElementById('editSshEnabled');
        if (editSshEnabledCheckbox) editSshEnabledCheckbox.checked = false;
        const editSshUsernameInput = document.getElementById('editSshUsername');
        if (editSshUsernameInput) editSshUsernameInput.value = '';
        const editSshPasswordInput = document.getElementById('editSshPassword');
        if (editSshPasswordInput) editSshPasswordInput.value = '';
        const editSshCredentialsDiv = document.querySelector('#editDeviceModal .ssh-credentials-edit');
        if (editSshCredentialsDiv) editSshCredentialsDiv.style.display = 'none';
    }

    // Обробник для чекбокса SSH у формі редагування
    if (editSshEnabledCheckbox && editSshCredentialsDiv) {
        // Переконайтеся, що обробник додається лише один раз або видаляється старий
        // Простий спосіб - клонувати та замінити елемент, щоб видалити старі обробники
        const newSshEnabledCheckbox = editSshEnabledCheckbox.cloneNode(true);
        editSshEnabledCheckbox.parentNode.replaceChild(newSshEnabledCheckbox, editSshEnabledCheckbox);
        
        newSshEnabledCheckbox.addEventListener('change', function() {
            if (editSshCredentialsDiv) {
                editSshCredentialsDiv.style.display = this.checked ? 'block' : 'none';
            }
            if (!this.checked) {
                if(editSshUsernameInput) editSshUsernameInput.value = '';
                if(editSshPasswordInput) editSshPasswordInput.value = '';
            }
        });
        // Оновлюємо посилання на чекбокс, оскільки ми його замінили
        // document.getElementById('editSshEnabled') тепер вказує на newSshEnabledCheckbox
    }

    document.getElementById('editDeviceModal').style.display = 'block';
    displayError(""); 
}

// Assuming editDeviceForm is global or correctly scoped
const editDeviceForm = document.getElementById('editDeviceForm');
if (editDeviceForm) {
    editDeviceForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const deviceId = document.getElementById('editDeviceId').value;
        const name = document.getElementById('editDeviceName').value.trim();
        const ip_address = document.getElementById('editDeviceIp').value.trim();

        if (!name || !ip_address) {
            displayError("Ім'я та IP-адреса не можуть бути порожніми при редагуванні.");
            return;
        }

        const payload = { name, ip_address };
        
        // SNMP Fields
        payload.snmp_enabled = document.getElementById('editSnmpEnabled').checked;
        const snmp_version_val = document.getElementById('editSnmpVersion').value;
        payload.snmp_version = payload.snmp_enabled && snmp_version_val ? parseInt(snmp_version_val) : null;
        payload.snmp_community = payload.snmp_enabled ? (document.getElementById('editSnmpCommunity').value.trim() || null) : null;
        const snmp_port_val = document.getElementById('editSnmpPort').value.trim();
        payload.snmp_port = payload.snmp_enabled && snmp_port_val ? parseInt(snmp_port_val) : null;

        // SSH Fields
        const sshEnabledCheckbox = document.getElementById('editSshEnabled'); // Отримуємо актуальний елемент
        payload.ssh_enabled = sshEnabledCheckbox ? sshEnabledCheckbox.checked : false;
        const sshUsernameInput = document.getElementById('editSshUsername');
        const sshPasswordInput = document.getElementById('editSshPassword');

        payload.ssh_username = payload.ssh_enabled && sshUsernameInput ? (sshUsernameInput.value.trim() || null) : null;
        // Пароль надсилаємо тільки якщо він не порожній, щоб не перезаписувати існуючий пароль порожнім рядком
        // якщо користувач не хоче його змінювати.
        const sshPassword = payload.ssh_enabled && sshPasswordInput ? sshPasswordInput.value : null;
        if (sshPassword) { // Надсилаємо пароль, тільки якщо він введений
            payload.ssh_password = sshPassword;
        }
        // Якщо payload.ssh_enabled = false, бекенд має очистити ssh_username та ssh_password_encrypted.
        console.log("Дані для надсилання (редагування пристрою):", payload); // <--- ЛОГ ДЛЯ ДІАГНОСТИКИ

        try {
            const response = await fetch(`/api/devices/${deviceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || JSON.stringify(result.errors) || `HTTP помилка ${response.status}`);
            }
            document.getElementById('editDeviceModal').style.display = 'none';
            await fetchAllDevices(); 
            displayError(""); 
            alert(`Пристрій "${result.name}" успішно оновлено.`);
            // Оновлюємо глобальну статистику
            if (typeof window.triggerGlobalStatsUpdate === 'function') {
                window.triggerGlobalStatsUpdate();
            }
        } catch (error) {
            console.error(`Помилка оновлення пристрою ID ${deviceId}:`, error);
            displayError("Не вдалося оновити пристрій: " + error.message);
        }
    });
} else {
    // console.warn("editDeviceForm not found, skipping event listener attachment.");
}