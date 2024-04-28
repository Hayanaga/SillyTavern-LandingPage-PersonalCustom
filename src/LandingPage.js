import { characters } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import { groups } from '../../../../group-chats.js';
import { executeSlashCommands } from '../../../../slash-commands.js';
import { debounce, delay } from '../../../../utils.js';
import { log } from '../index.js';
import { Card } from './Card.js';

export class LandingPage {
    /**@type {Card[]}*/ cards = [];

    /**@type {Object}*/ settings;

    /**@type {HTMLElement}*/ dom;
    /**@type {HTMLVideoElement}*/ video;
    /**@type {HTMLVideoElement}*/ intro;
    /**@type {Boolean}*/ isStartingVideo;

    /**@type {Boolean}*/ isInputting = false;
    /**@type {String}*/ input = '';
    /**@type {Number}*/ inputTime = 0;
    /**@type {HTMLElement}*/ inputDisplayContainer;
    /**@type {HTMLElement}*/ inputDisplay;
    /**@type {Function}*/ handeInputBound;

    /**@type {Function}*/ updateBackgroundDebounced;




    constructor() {
        this.settings = Object.assign({
            isEnabled: true,
            displayStyle: 'Bottom',
            cardHeight: 200,
            showFavorites: true,
            onlyFavorites: false,
            highlightFavorites: true,
            numCards: 5,
            numAvatars: 4,
            showExpression: true,
            extensions: ['png'],
            expression: 'joy',
            menuList: [],
            lastChat: { character:null, group:null },
            hideTopBar: true,
            bgList: [],
        }, extension_settings.landingPage ?? {});
        extension_settings.landingPage = this.settings;
        if (this.settings.hideTopBar) {
            document.body.classList.add('stlp--hideTopBar');
        }

        this.handeInputBound = this.handleInput.bind(this);
        this.updateBackgroundDebounced = debounce(this.updateBackground.bind(this), 1000);
    }


    async load() {
        log('LandingPage.load');
        const compCards = (a,b)=>{
            if (this.settings.showFavorites) {
                if (a.fav && !b.fav) return -1;
                if (!a.fav && b.fav) return 1;
            }
            return b.date_last_chat - a.date_last_chat;
        };
        const cards = await Promise.all(
            [...characters, ...groups]
                .filter(it=>!this.settings.onlyFavorites || it.fav)
                .toSorted(compCards)
                .slice(0, this.settings.numCards)
                .map(it=>{
                    const card = new Card(it);
                    card.onOpenChat = ()=>{
                        this.dom.classList.add('stlp--busy');
                    };
                    return card.load();
                }),
        );
        this.cards = cards;
        log('LandingPage.load COMPLETED', this, cards);
    }




    async startVideo() {
        if (this.isStartingVideo) return;
        this.isStartingVideo = true;
        while (true) {
            if (this.video.src == '') break;
            try {
                await this.video.play();
                break;
            } catch(ex) {
                await delay(100);
            }
        }
        this.isStartingVideo = false;
    }
    async updateBackground() {
        if (!this.dom) return;
        if (this.isStartingVideo) return;
        this.isStartingVideo = true;
        let bg;
        for (const item of this.settings.bgList) {
            let val = (await executeSlashCommands(item.command))?.pipe;
            try { val = JSON.parse(val); } catch { /* empty */ }
            if (val) {
                bg = item;
                break;
            }
        }
        if (bg) {
            if (/\.mp4$/i.test(bg.url)) {
                const url = `${bg.url}?t=${new Date().getTime()}`;
                const urlIntro = `${bg.url.replace(/(\.[^.]+)$/, '-Intro$1')}?t=${new Date().getTime()}`;
                const resp = await fetch(url, {
                    method: 'HEAD',
                });
                if (!resp.ok) {
                    this.video.src = '';
                    this.dom.style.backgroundImage = '';
                    toastr.warning(`Could not find background: ${bg.url}`);
                    return;
                }
                const respIntro = await fetch(urlIntro, {
                    method: 'HEAD',
                });
                this.dom.style.backgroundImage = '';
                if (respIntro.ok) {
                    this.video.style.opacity = '0';
                    this.video.autoplay = false;
                    this.video.src = url;
                    await new Promise(resolve=>{
                        this.intro.src = urlIntro;
                        this.intro.addEventListener('ended', resolve, { once:true });
                    });
                    this.video.play();
                    this.video.style.opacity = '1';
                    await delay(100);
                    this.intro.style.opacity = '0';
                    this.intro.src = '';
                } else {
                    this.video.style.opacity = '1';
                    this.video.src = url;
                }
            } else {
                this.video.src = '';
                this.dom.style.backgroundImage = `url("${bg.url}")`;
            }
        } else {
            this.video.src = '';
            this.dom.style.backgroundImage = '';
        }
        this.isStartingVideo = false;
    }




    async render() {
        this.dom?.remove();
        const container = document.createElement('div'); {
            container.classList.add('stlp--container');
            container.style.setProperty('--stlp--cardHeight', `${this.settings.cardHeight}px`);
            const intro = document.createElement('video'); {
                this.intro = intro;
                intro.classList.add('stlp--intro');
                intro.loop = false;
                intro.muted = true;
                intro.autoplay = true;
                container.append(intro);
            }
            const video = document.createElement('video'); {
                this.video = video;
                video.classList.add('stlp--video');
                video.loop = true;
                video.muted = true;
                video.autoplay = true;
                container.append(video);
            }
            const wrap = document.createElement('div'); {
                wrap.classList.add('stlp--wrapper');
                if (this.settings.highlightFavorites) {
                    wrap.classList.add('stlp--highlightFavorites');
                }
                wrap.setAttribute('data-displayStyle', this.settings.displayStyle);
                const root = document.createElement('div'); {
                    root.classList.add('stlp--cards');
                    const els = await Promise.all(this.cards.map(async(card)=>{
                        return await card.render(this.settings);
                    }));
                    els.forEach(it=>root.append(it));
                    wrap.append(root);
                }
                container.append(wrap);
            }
            const menu = document.createElement('ul'); {
                menu.classList.add('stlp--menu');
                this.settings.menuList.forEach(item=>{
                    const li = document.createElement('li'); {
                        li.classList.add('stlp--item');
                        li.setAttribute('data-stlp--label', item.label);
                        li.textContent = item.label;
                        li.addEventListener('click', async()=>{
                            await executeSlashCommands(item.command);
                        });
                        menu.append(li);
                    }
                });
                container.append(menu);
            }
            const inputDisplayContainer = document.createElement('div'); {
                this.inputDisplayContainer = inputDisplayContainer;
                inputDisplayContainer.classList.add('stlp--inputDisplayContainer');
                const inputDisplay = document.createElement('div'); {
                    this.inputDisplay = inputDisplay;
                    inputDisplay.classList.add('stlp--inputDisplay');
                    inputDisplayContainer.append(inputDisplay);
                }
            }
            this.dom = container;
            this.updateBackground();
        }

        window.addEventListener('keyup', this.handeInputBound);

        return this.dom;
    }
    unrender() {
        window.removeEventListener('keyup',this.handeInputBound);
        this.dom?.remove();
        this.dom = null;
    }




    endInput() {
        this.isInputting = false;
        this.input = '';
        this.inputTime = 0;
        this.inputDisplay.textContent = '';
        this.inputDisplayContainer.remove();
    }
    /**
     *
     * @param {KeyboardEvent} evt
     * @returns
     */
    handleInput(evt) {
        let key = evt.key;
        if (this.isInputting) {
            if (key == 'Escape') {
                this.endInput();
                return;
            }
            if (key == 'Enter' && !evt.shiftKey) {
                document.querySelector('#send_textarea').value = this.input;
                document.querySelector('#send_but').click();
                this.endInput();
                return;
            }
            if (key == 'Backspace') {
                this.input = this.input.slice(0, -1);
                key = '';
            }
        }
        if (key == 'Enter' && evt.shiftKey) key = '\n';
        if (key.length > 1 || evt.ctrlKey || evt.altKey) return;
        if (!this.isInputting) {
            log('ACTIVE', document.activeElement);
            if (document.activeElement != document.body) return;
            this.isInputting = true;
            this.dom.append(this.inputDisplayContainer);
        }
        this.input += key;
        this.inputTime = new Date().getTime();
        this.inputDisplay.textContent = this.input;
    }
}
