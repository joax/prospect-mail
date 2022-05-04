const { app, BrowserWindow, shell, ipcMain, Notification, Menu, MenuItem } = require('electron')
const settings = require('electron-settings')
const CssInjector = require('../js/css-injector')
const JsInjector = require('../js/js-injector')
const path = require('path')

let outlookUrl
let deeplinkUrls
let outlookUrls
let showWindowFrame
let $this

class MailWindowController {
    constructor() {
        $this = this
        this.init()
    }
    reloadSettings() {
        // Get configurations.
        showWindowFrame = (settings.getSync('showWindowFrame') === undefined) ? true : settings.getSync('showWindowFrame')
        outlookUrl = settings.getSync('urlMainWindow') || 'https://outlook.office.com/mail'
        deeplinkUrls = settings.getSync('urlsInternal') || ['to-do.office.com/tasks', 'outlook.live.com/mail/deeplink', 'outlook.office365.com/mail/deeplink', 'outlook.office.com/mail/deeplink', 'outlook.office.com/calendar/deeplink']
        outlookUrls = settings.getSync('urlsExternal') || ['outlook.live.com', 'outlook.office365.com', 'outlook.office.com']
    }

    init() {
        this.reloadSettings()

        // Create the browser window.
        this.win = new BrowserWindow({
            x: 100,
            y: 100,
            width: 1400,
            height: 900,
            roundedCorners: true,
            frame: showWindowFrame,
            transparent: false,
            autoHideMenuBar: true,
            hasShadow: true,
            show: false,
            title: 'Prospect Mail',
            icon: path.join(__dirname, '../../assets/outlook_linux_black.png'),
            webPreferences: {
                devTools: true,
                spellcheck: true,
                nativeWindowOpen: true,
                nodeIntegration: true,
                contextIsolation: false,
                backgroundColor: 'white',
                affinity: 'main-window'
            }
        })

        this.win.shadow = true;

        // and load the index.html of the app.
        this.win.loadURL(outlookUrl)

        // Show window handler
        ipcMain.on('show', (event) => {
            this.show()
        })

        // Show Notfications (instead of HTML5)
        ipcMain.on('unread-messages-notification', (event, arg) => {
            const iconPath = '../../assets/outlook_linux_black.png'
            arg.icon = path.join(__dirname, iconPath)
            let notification = new Notification(arg)
            notification.show()
        })

        // Open Teams Scheduler
        ipcMain.on('schedule-teams', (event, arg) => {
            this.openInBrowser(event, 'https://teams.microsoft.com/l/meeting/new')
        })

        // add right click handler for editor spellcheck
        this.win.webContents.on('context-menu', (event, params) => {
            event.preventDefault()
            var show = false
            if (params && params.dictionarySuggestions) {
                const menu = new Menu()
                menu.append(new MenuItem({
                    label: 'Spelling',
                    enabled: false
                }))
                menu.append(new MenuItem({
                    type: 'separator'
                }))
                if (params.misspelledWord) {
                    // allow them to add to dictionary
                    show = true
                    menu.append(new MenuItem({
                        label: 'Add to dictionary',
                        click: () => this.win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
                    }))
                }
                menu.append(new MenuItem({
                    type: 'separator'
                }))
                if (params.dictionarySuggestions.length > 0) {
                    show = true
                    // add each spelling suggestion
                    for (const suggestion of params.dictionarySuggestions) {
                        menu.append(new MenuItem({
                            label: suggestion,
                            click: () => this.win.webContents.replaceMisspelling(suggestion)
                        }))
                    }
                } else {
                    // no suggestions
                    menu.append(new MenuItem({
                        label: 'No Suggestions',
                        enabled: false
                    }))
                }
                if (show) {
                    menu.popup()
                }
            }
        })

        // insert styles
        this.win.webContents.on('dom-ready', () => {
            this.win.webContents.insertCSS(CssInjector.main)
            let that = this
            if (!showWindowFrame) {
                let a = this.win.webContents.insertCSS(CssInjector.noFrame)
                a.then(() => {
                    // Add unread Messages Notification reader
                    that.addUnreadNumberObserver()
                    that.win.show()
                })
                .catch((err) => { 
                    console.log('Error CSS Insertion:', err)
                })
            } else {
                this.win.show()
            }
        })

        // prevent the app quit, hide the window instead.
        this.win.on('close', (e) => {
            //console.log('Log invoked: ' + this.win.isVisible())
            if (this.win.isVisible()) {
                if (settings.getSync('hideOnClose') === undefined ? true : settings.getSync('hideOnClose')) {
                    e.preventDefault()
                    this.win.hide()
                } else {
                    // Close the app
                    app.exit()
                }
            }
        })

        this.win.webContents.on('did-create-window', (childWindow) => {
            // insert styles
            childWindow.webContents.on('dom-ready', () => {
                childWindow.webContents.insertCSS(CssInjector.main)

                let that = this
                if (!showWindowFrame) {
                    childWindow.webContents.insertCSS(CssInjector.noFrame)
                    .then(() => {
                        childWindow.webContents.executeJavaScript(JsInjector.childWindow)
                            .then(() => {
                                //console.log('Opening Child Window here...')
                                childWindow.webContents.setWindowOpenHandler(this.openInBrowser)
                                childWindow.show()
                            })
                            .catch((errJS) => {
                                console.log('Error JS Insertion:', errJS)        
                            })
                    })
                    .catch((err) => { 
                        console.log('Error CSS Insertion:', err)
                    })
                }
            })
        })

        // prevent the app minimze, hide the window instead.
        this.win.on('minimize', (e) => {
            if (settings.getSync('hideOnMinimize') === undefined ? true : settings.getSync('hideOnMinimize')) {
                e.preventDefault()
                this.win.hide()
            } 
        })

        // Emitted when the window is closed.
        this.win.on('closed', () => {
            // Dereference the window object, usually you would store windows
            // in an array if your app supports multi windows, this is the time
            // when you should delete the corresponding element.
            this.win = null
        })

        // Open the new window in external browser
        this.win.webContents.setWindowOpenHandler(this.openInBrowser)
    }

    // Adds observer for the unread messages.
    addUnreadNumberObserver() {
        this.win.webContents.executeJavaScript(JsInjector.main)
    }

    // Toggles Window
    toggleWindow() {
        if (this.win.isVisible()) {
            this.win.hide()
        } else {
            this.show()
        }
    }
    reloadWindow() {
        this.win.reload()
    }

    openInBrowser({ url }) {
        if (new RegExp(deeplinkUrls.join('|')).test(url)) {
            // Default action - if the user wants to open mail in a new window - let them.
            return { 
                action: 'allow',
                overrideBrowserWindowOptions: {
                    frame: showWindowFrame || false,
                    fullscreenable: false,
                    backgroundColor: 'white'
                } 
            }
        }
        else if (new RegExp(outlookUrls.join('|')).test(url)) {
            // Open calendar, contacts and tasks in the same window
            // e.preventDefault()
            this.loadURL(url)
            return { action: 'deny' }
        }
        else if (url == "about:blank#blocked") {
            // Do nothing
            // e.preventDefault()
            shell.openExternal("https://teams.microsoft.com/l/meeting/new")
            return { action: 'deny' }
        }
        else {
            // Send everything else to the browser
            // e.preventDefault()
            shell.openExternal(url)
            return { action: 'deny' }
        }
    }

    show() {
        this.win.show()
        this.win.focus()
    }
}

module.exports = MailWindowController
