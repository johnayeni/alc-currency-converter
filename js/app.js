// CURRENCY API URL
const API_URL = 'https://free.currencyconverterapi.com';

// get all dom elements that need to be manipulated
const view = {
  offlineIndicator: document.querySelector('#offline'),
  onlineIndicator: document.querySelector('#online'),
  currencyList1: document.querySelector('#currencyList1'),
  currencyList2: document.querySelector('#currencyList2'),
  input1: document.querySelector('#input1'),
  input2: document.querySelector('#input2'),
  input1Label: document.querySelector('#input1Label'),
  input2Label: document.querySelector('#input2Label'),
  label1: document.querySelector('#label1'),
  label2: document.querySelector('#label2'),
  snackbar: document.querySelector('#snackbar'),
  snackbarText: document.querySelector('#snackbar-text'),
  conversionsList: document.querySelector('#conversionsList'),
};

const openDatabase = () => {
  // If the browser doesn't support service worker,
  // we don't care about having a database
  if (!navigator.serviceWorker) {
    return Promise.resolve();
  }

  return idb.open('currency-converter', 1, upgradeDb => {
    const currencyStore = upgradeDb.createObjectStore('currencies', {
      keyPath: 'name',
    });
    const conversionStore = upgradeDb.createObjectStore('conversions', {
      keyPath: 'id',
    });
  });
};

// diaplay toast at the bottom of the page
const showToast = message => {
  view.snackbarText.textContent = message;
  view.snackbar.classList.add('show');
  // close toast after 10 seconds
  setInterval(() => {
    closeToast();
  }, 10000);
};

// close the toast
const closeToast = () => {
  view.snackbar.classList.remove('show');
};

class ApplicationController {
  constructor() {
    this.currencies = new Array();
    this.inputTrigger = 'input1';
    this._dbPromise = openDatabase();
    this._registerServiceWorker();
    this._updateNetworkStatus();
    this._monitorNetwork();
    this._fetchCurrencies();
    this._showOfflineConversions();
  }

  // register service worker
  _registerServiceWorker() {
    let sw = '/sw.js';

    // fix for github pages hosting
    if (window.location.hostname === 'johnayeni.github.io')
      sw = '/alc-currency-converter/sw.js';

    if (navigator.serviceWorker) {
      try {
        navigator.serviceWorker.register(sw);
        console.log('Service worker registered');
      } catch (e) {
        console.log('Service worker registertion failed');
      }
    }
  }

  ////////CURRENCY RELATED METHODS/////////

  // get list of currencies from API
  async _fetchCurrencies() {
    const appController = this;
    try {
      if (navigator.onLine) {
        const response_ = await fetch(`${API_URL}/api/v5/countries`);
        const response = await response_.json();
        appController.currencies = Object.keys(response.results).map(key => {
          return {
            name: response.results[key].currencyId,
            details: response.results[key],
          };
        });
        appController._addCurrenciesToView(appController.currencies);
        appController._storeCurrenciesInIDB(appController.currencies);
        appController._fetchConversionRate();
      } else {
        appController._getCurrenciesFromIDB();
      }
    } catch (error) {
      showToast('Cannot currently get any data');
    }
  }

  // store list of currencies on IDB
  _storeCurrenciesInIDB(currencies) {
    const appController = this;
    appController._dbPromise.then(db => {
      if (!db) return;

      const tx = db.transaction('currencies', 'readwrite');
      const store = tx.objectStore('currencies');
      // remove all previously stored currencies
      store.openCursor(null).then(function deleteRest(cursor) {
        if (!cursor) return;
        cursor.delete();
        return cursor.continue().then(deleteRest);
      });
      currencies.forEach(currency => {
        store.put(currency);
      });
    });
  }

  // get a conversion rate from IDB
  _getCurrenciesFromIDB() {
    const appController = this;
    appController._dbPromise.then(db => {
      if (!db) return;

      let tx = db.transaction('currencies').objectStore('currencies');
      return tx.getAll().then(currencies => {
        appController.currencies = [...currencies];
        appController._addCurrenciesToView(currencies);
        appController._fetchConversionRate();
      });
    });
  }

  // add list of currencies to view
  _addCurrenciesToView(currencies) {
    const appController = this;
    for (let currency of currencies) {
      const option1 = document.createElement('option');
      option1.text = view.input1Label.text = `${currency.name}-${
        appController.currencies.filter(obj => obj.name == currency.name)[0]
          .details.currencyName
      }`;
      view.currencyList1.add(option1);
    }
    for (let currency of currencies.reverse()) {
      const option2 = document.createElement('option');
      option2.text = view.input2Label.text = `${currency.name}-${
        appController.currencies.filter(obj => obj.name == currency.name)[0]
          .details.currencyName
      }`;
      view.currencyList2.add(option2);
    }
    appController._userInteraction();
  }

  ////////END OF CURRENCY RELATED METHODS/////////

  ////////CONVERSION RELATED METHODS/////////

  // get conversion rate from API
  async _fetchConversionRate() {
    const appController = this;
    const currency1 = view.currencyList1.value.split('-')[0];
    const currency2 = view.currencyList2.value.split('-')[0];
    const query = `${currency1.toUpperCase()}_${currency2.toUpperCase()}`;
    let conversion = await appController._getConversionFromIDB(query);
    if (!conversion) {
      try {
        const response_ = await fetch(`${API_URL}/api/v5/convert?q=${query}`);
        const response = await response_.json();
        appController._storeConversionInIDB(response.results[query]);
        appController._showOfflineConversions();
        conversion = response.results[query];
      } catch (error) {
        showToast('Conversion not available offline');
      }
      if (!conversion) showToast('Conversion not available offline');
      else appController._applyConversionRate(conversion.val, query);
    } else {
      appController._applyConversionRate(conversion.val, query);
    }
  }

  // store a conversion rate on IDB
  _storeConversionInIDB(conversion) {
    const appController = this;
    appController._dbPromise.then(db => {
      if (!db) return;

      const tx = db.transaction('conversions', 'readwrite');
      const store = tx.objectStore('conversions');
      store.put(conversion);
    });
  }

  // get list of conversions from IDB
  async _getConversionFromIDB(query) {
    const appController = this;
    const db = await appController._dbPromise;
    if (!db) return;
    const tx = db.transaction('conversions').objectStore('conversions');
    const response = await tx.get(query);
    return response;
  }

  // apply conversion rate to inputs
  _applyConversionRate(rate, query) {
    const appController = this;
    appController._changeConvesrionDecription(rate, query);
    if (appController.inputTrigger == 'input1') {
      view.input2.value = Number(view.input1.value) * Number(rate);
    } else if (appController.inputTrigger == 'input2') {
      view.input1.value = Number(view.input2.value) / Number(rate);
    }
  }

  // show the user a list of conversions avaialble offline
  _showOfflineConversions() {
    const appController = this;
    appController._dbPromise.then(db => {
      if (!db) return;

      const tx = db.transaction('conversions').objectStore('conversions');
      return tx.getAll().then(conversions => {
        let list = '';
        for (let conversion of conversions) {
          list += `<li class="mdl-list__item">
                    <span class="mdl-list__item-primary-content">
                      ${conversion.id.split('_')[0]} to ${
            conversion.id.split('_')[1]
          }  -- ${conversion.val}
                    </span>
                  </li>`;
        }
        view.conversionsList.innerHTML = list;
      });
    });
  }

  // Change the conversion decsription be displayed
  _changeConvesrionDecription(rate, query) {
    const appController = this;
    const currency1 = query.split('_')[0];
    const currency2 = query.split('_')[1];
    view.input1Label.textContent = currency1;
    view.input2Label.textContent = currency2;
    view.label1.textContent = `1 ${
      appController.currencies.filter(obj => obj.name == currency1)[0].details
        .currencyName
    } is equal to`;
    view.label2.textContent = `${rate} ${
      appController.currencies.filter(obj => obj.name == currency2)[0].details
        .currencyName
    }`;
  }

  ////////END OF CONVERSION RELATED METHODS/////////

  ////////NETWORK MONITORING METHODS/////////

  // monitor network status
  _monitorNetwork() {
    window.addEventListener('online', this._updateNetworkStatus.bind(this));
    window.addEventListener('offline', this._updateNetworkStatus.bind(this));
  }

  // update network status
  _updateNetworkStatus() {
    const appController = this;
    if (navigator.onLine) {
      if (appController.currencies.length < 1) appController._fetchCurrencies();
      closeToast();
      showToast('Online Mode');
      view.offlineIndicator.classList.add('hide');
      view.offlineIndicator.classList.remove('show');
      view.onlineIndicator.classList.remove('hide');
      view.onlineIndicator.classList.add('show');
    } else {
      closeToast();
      showToast('Offline Mode');
      view.onlineIndicator.classList.add('hide');
      view.onlineIndicator.classList.remove('show');
      view.offlineIndicator.classList.remove('hide');
      view.offlineIndicator.classList.add('show');
    }
  }

  ////////END OF NETWORK MONITORING METHODS/////////

  ////////OTHER METHODS/////////

  // trigger user interaction
  _userInteraction(inputTrigger = 'input1') {
    const appController = this;
    appController.inputTrigger = inputTrigger;
    appController._fetchConversionRate();
  }
}

// Create application instance
const app = new ApplicationController();
