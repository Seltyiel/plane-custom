# Plane-custom — Guida al deploy passo-passo

> Versione 1.0 — primo deploy su PC dedicato (self-hosted) con accesso via Tailscale.
> Target: 50 utenti aziendali, singolo ambiente di produzione, build locale Windows + trasferimento immagini.

Questa guida ti porta da "PC vergine" a "Plane operativo accessibile da tutti i tuoi utenti via Tailscale" senza saltare nessun passo. Ogni comando è spiegato. I placeholder `[SCREENSHOT n]` indicano dove inserire screenshot della procedura — descrizione sotto.

## Indice

1. [Architettura finale](#1-architettura-finale)
2. [Prerequisiti](#2-prerequisiti)
3. [Step 1 — Installare Ubuntu Server sul PC](#step-1--installare-ubuntu-server-sul-pc)
4. [Step 2 — Configurazione iniziale del sistema](#step-2--configurazione-iniziale-del-sistema)
5. [Step 3 — Hardening base (firewall, SSH key, auto-update)](#step-3--hardening-base-firewall-ssh-key-auto-update)
6. [Step 4 — Installare Docker + Docker Compose](#step-4--installare-docker--docker-compose)
7. [Step 5 — Creare account Tailscale e installare il client sul server](#step-5--creare-account-tailscale-e-installare-il-client-sul-server)
8. [Step 6 — Configurare HTTPS via Tailscale Serve](#step-6--configurare-https-via-tailscale-serve)
9. [Step 7 — Trasferire le immagini Docker dal tuo PC Windows](#step-7--trasferire-le-immagini-docker-dal-tuo-pc-windows)
10. [Step 8 — Preparare la directory di runtime sul server](#step-8--preparare-la-directory-di-runtime-sul-server)
11. [Step 9 — Configurare le variabili d'ambiente di Plane](#step-9--configurare-le-variabili-dambiente-di-plane)
12. [Step 10 — Avviare Plane](#step-10--avviare-plane)
13. [Step 11 — Configurazione iniziale di Plane (admin, workspace)](#step-11--configurazione-iniziale-di-plane-admin-workspace)
14. [Step 12 — Backup automatico verso Backblaze B2](#step-12--backup-automatico-verso-backblaze-b2)
15. [Step 13 — Onboarding utenti su Tailscale](#step-13--onboarding-utenti-su-tailscale)
16. [Step 14 — Aggiornamenti futuri (release v1.35c, v1.36...)](#step-14--aggiornamenti-futuri)
17. [Comandi di emergenza e troubleshooting](#comandi-di-emergenza-e-troubleshooting)
18. [Reference rapido](#reference-rapido)

---

## 1. Architettura finale

```
┌──────────────────────────────────────────────────────────────────┐
│                    INTERNET                                       │
└──────────────────────┬───────────────────────────────────────────┘
                       │
              ┌────────┴───────────┐
              │  Tailscale cloud   │  (control plane)
              │  (auth + relay)    │
              └────────┬───────────┘
                       │
       ┌───────────────┼───────────────────┐
       │               │                   │
   ┌───▼────┐      ┌──▼─────┐         ┌───▼────┐
   │ Laptop │      │ Mobile │  ...    │ Laptop │
   │ utente │      │ utente │         │  admin │
   │ + tail │      │ + tail │         │ + tail │
   └────────┘      └────────┘         └────────┘
                       │
                       │  HTTPS via Tailscale Serve
                       │  https://plane-server.<tailnet>.ts.net
                       │
        ┌──────────────▼──────────────────────┐
        │  Server Ubuntu (PC fisico)          │
        │  ┌────────────────────────────┐     │
        │  │ Tailscale daemon            │     │
        │  └─────────────┬───────────────┘     │
        │                │                     │
        │  ┌─────────────▼───────────────┐     │
        │  │ Docker + 11 container Plane │     │
        │  │  - proxy (nginx, :80)       │     │
        │  │  - web, api, worker, beat   │     │
        │  │  - admin, space, live       │     │
        │  │  - postgres, redis, mq, mio │     │
        │  └─────────────────────────────┘     │
        │                                      │
        │  /var/backups/plane → Backblaze B2   │
        └──────────────────────────────────────┘
```

**Cosa NON è esposto su internet pubblico:**
- Le porte 80/443 del server NON sono raggiungibili da internet.
- Postgres, Redis, RabbitMQ NON sono raggiungibili da internet.
- L'unico modo per arrivare a Plane è essere autenticati su Tailscale ed essere stati ammessi nel tuo Tailnet.

**Cosa È esposto su internet:**
- Niente. Tailscale apre solo connessioni in uscita dal server (UDP a server `*.tailscale.com`). Il firewall del router resta chiuso.

---

## 2. Prerequisiti

Prima di iniziare procurati:

- [ ] **PC dedicato** con almeno 4 core CPU (Intel 8th gen+ o AMD Ryzen 3000+), 16 GB RAM, SSD da 256 GB.
- [ ] **UPS** (gruppo di continuità). Anche un APC Back-UPS 700VA ~80€ basta. Senza UPS rischi corruzione del database al primo blackout.
- [ ] **Connessione Ethernet via cavo** dal PC al router (no Wi-Fi).
- [ ] **Chiavetta USB da almeno 8 GB** per l'installer Ubuntu.
- [ ] **Un altro PC/Mac** (il tuo Windows attuale) per:
  - Scaricare l'ISO Ubuntu e creare la chiavetta
  - Buildare le immagini Docker custom con `build.bat`
  - SSH-are nel server una volta in piedi
- [ ] **Email aziendale** per registrare l'account Tailscale (es. `admin@tuaazienda.it`). Se non hai ancora un dominio aziendale puoi usare anche Google personale, valuta tu.
- [ ] **Account Backblaze B2** (opzionale ma consigliato per i backup off-site, gratis fino a 10 GB poi ~$5/TB/mese). Lo creiamo allo Step 12.

Tempo totale stimato per il setup completo: **3-4 ore** la prima volta, di cui ~1h di attesa passiva (download/install/build).

---

## Step 1 — Installare Ubuntu Server sul PC

### 1.1 Scaricare l'ISO

Sul tuo PC Windows attuale, vai su [https://ubuntu.com/download/server](https://ubuntu.com/download/server) e scarica **Ubuntu Server 24.04 LTS** (o 22.04 LTS se preferisci la "stagionata"). Sono ~2.5 GB.

> [SCREENSHOT 1: pagina download Ubuntu Server con bottone "Download Ubuntu Server 24.04.x LTS" evidenziato]

### 1.2 Creare la chiavetta USB bootable

Scarica **Rufus** da [https://rufus.ie](https://rufus.ie) (è un singolo .exe, non serve installare).

1. Inserisci la chiavetta USB (verrà cancellata, salva tutto quello che c'è sopra prima).
2. Apri Rufus.
3. **Device**: seleziona la tua chiavetta USB.
4. **Boot selection**: clicca SELECT e scegli l'ISO Ubuntu scaricato.
5. **Partition scheme**: GPT (per PC moderni con UEFI) o MBR (per PC vecchi BIOS legacy). Lascia il default che Rufus suggerisce.
6. Clicca **START**.
7. Se chiede "Write in ISO Image mode (Recommended)", confermi.

> [SCREENSHOT 2: Rufus pronto a scrivere con i parametri sopra]

Aspetta ~5 minuti. Quando finisce hai una chiavetta Ubuntu pronta.

### 1.3 Bootare il PC dalla chiavetta

1. Spegni il PC dedicato.
2. Inserisci la chiavetta USB.
3. Accendi e premi ripetutamente il tasto del **boot menu** (tipicamente F12, F11, F10 o ESC, dipende dal produttore — guarda la prima schermata che appare all'accensione).
4. Seleziona la chiavetta USB dal menu.

> [SCREENSHOT 3: schermata BIOS/UEFI boot menu con la voce "USB" o nome del modello chiavetta selezionata]

Si avvia GRUB con il menu di Ubuntu. Premi INVIO su "Try or Install Ubuntu Server".

### 1.4 Installazione guidata

Risponde a queste domande nell'ordine in cui appaiono:

1. **Lingua**: English (più documentazione online se cerchi errori).
2. **Keyboard configuration**: Italian se la tua tastiera è italiana.
3. **Type of installation**: "Ubuntu Server" (NON "Ubuntu Server (minimized)" — quello manca alcuni tool che useremo).
4. **Network connections**: lascia il default (DHCP). Lo configureremo come IP statico dopo.
5. **Configure proxy**: lascia vuoto.
6. **Mirror**: lascia il default (`it.archive.ubuntu.com` se sei in Italia).
7. **Storage configuration**: "Use an entire disk" + seleziona il disco. NON spuntare "Set up this disk as an LVM group" se non sai cosa è (semplifica il backup). Conferma "Custom storage layout" → "Done" → ti mostra il piano partizionamento → "Continue" → conferma scrittura.
   > ⚠ Questa operazione cancella TUTTO il disco. Conferma solo se hai backuppato.
8. **Profile setup**:
   - Your name: `Plane Admin` (o quello che vuoi)
   - Your server's name: **`plane-server`** (questo è l'hostname, lo riuserai dopo)
   - Pick a username: **`plane`** (l'utente Linux che userai per SSH)
   - Choose a password: usa un gestore di password e generane una di 20+ caratteri. Salva. La userai poco perché useremo le SSH key.
9. **Upgrade to Ubuntu Pro**: skip.
10. **SSH Setup**: spunta "Install OpenSSH server". Lascia "Import SSH identity → No". Importeremo le chiavi dopo.
11. **Featured server snaps**: NON selezionare nulla. Lasciamo l'installazione minimale.
12. Aspetta che finisca l'installazione (~10-15 min).
13. Quando finisce ti chiede di rimuovere la chiavetta e premere INVIO per riavviare.

> [SCREENSHOT 4: schermata "Installation complete!" con istruzioni di rimozione chiavetta]

Dopo il reboot vedi un prompt di login testuale. Inserisci `plane` e la password che hai scelto. Sei dentro il server, in shell.

### 1.5 BIOS — accendere automaticamente dopo blackout

Riavvia il server e premi il tasto BIOS (DEL o F2, dipende dal produttore). Cerca un'opzione tipo:

- "AC Power Loss Recovery" → setta su **Power On**
- oppure "After Power Failure" → **Always On**
- oppure "Restore on AC/Power Loss" → **Power On**

Salva (F10 di solito) ed esci. Se non trovi questa opzione, alcuni BIOS la chiamano in modo diverso, prova a googlare "[modello del tuo PC] AC power loss bios setting".

> [SCREENSHOT 5: schermata BIOS con "AC Power Loss Recovery" su "Power On"]

---

## Step 2 — Configurazione iniziale del sistema

Da qui in poi lavorerai sul server. Puoi continuare sulla console fisica, ma è più comodo SSH-are dal tuo PC Windows. Lo facciamo allo Step 3 dopo aver impostato l'IP statico.

### 2.1 Aggiornare il sistema

Comando:

```bash
sudo apt update && sudo apt upgrade -y
```

**Cosa fa:**
- `sudo` esegue il comando come root (chiederà la password una volta).
- `apt update` aggiorna l'indice dei pacchetti disponibili (NON aggiorna il software ancora).
- `&&` esegue il comando successivo solo se il primo è andato a buon fine.
- `apt upgrade -y` aggiorna effettivamente tutti i pacchetti già installati. `-y` risponde "yes" a tutte le conferme.

Aspetta che finisca (~5-10 min la prima volta, ci sono parecchi update post-installazione). Se ti chiede "Daemons using outdated libraries should be restarted" rispondi tab fino a `<Ok>` e premi INVIO (lascia tutti selezionati).

### 2.2 IP statico sul server

Sul prompt scrivi:

```bash
ip addr show
```

**Cosa fa:** mostra le interfacce di rete e i loro indirizzi IP. Cerca quella che inizia con `enp...` o `eth...` (ethernet). Annota:
- Il **nome interfaccia** (es. `enp3s0`)
- L'**IP attuale assegnato dal router** (es. `192.168.1.42`)

Esempio di output:
```
2: enp3s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether aa:bb:cc:dd:ee:ff brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.42/24 brd 192.168.1.255 scope global dynamic enp3s0
```

Vai sul **router** (apri browser su `http://192.168.1.1` o l'IP del tuo router, login con admin password — di solito stampata sul router stesso) e cerca la sezione "DHCP Reservation" / "Static Lease" / "Riserva indirizzo IP". Aggiungi una regola:

- MAC address: `aa:bb:cc:dd:ee:ff` (quello mostrato dopo `link/ether` sopra)
- IP riservato: `192.168.1.42` (lo stesso che già aveva, così evitiamo conflitti)

Salva. Ora il router darà sempre lo stesso IP a quel MAC. Riavvia il server per essere sicuro:

```bash
sudo reboot
```

Aspetta 30 secondi, ricollegati. `ip addr show` deve mostrare lo stesso IP.

### 2.3 Hostname e timezone

```bash
sudo hostnamectl set-hostname plane-server
sudo timedatectl set-timezone Europe/Rome
```

**Cosa fa:**
- `hostnamectl set-hostname` cambia il nome del server (lo vedrai nel prompt e in Tailscale).
- `timedatectl set-timezone` setta il fuso orario (importante per i log e per i meeting di Plane).

Verifica:
```bash
hostnamectl
timedatectl
```

---

## Step 3 — Hardening base (firewall, SSH key, auto-update)

### 3.1 Generare una SSH key sul tuo PC Windows

Torna sul tuo Windows (apri PowerShell o Terminal):

```powershell
ssh-keygen -t ed25519 -C "plane-admin@windows"
```

**Cosa fa:**
- `ssh-keygen` genera una coppia di chiavi (privata + pubblica) per autenticazione SSH senza password.
- `-t ed25519` usa l'algoritmo ed25519 (più sicuro e rapido di RSA).
- `-C` aggiunge un commento (per ricordarti di chi è la chiave).

Quando chiede dove salvarla premi INVIO (default `C:\Users\<tu>\.ssh\id_ed25519`). Quando chiede passphrase: scegli una passphrase forte (la userai per sbloccare la chiave la prima volta in ogni sessione). Salvala nel password manager.

> [SCREENSHOT 6: PowerShell con output di ssh-keygen che mostra "Your identification has been saved" e il fingerprint]

Ora copia il contenuto della chiave **pubblica** (file `.pub`):

```powershell
cat $env:USERPROFILE\.ssh\id_ed25519.pub
```

Output: una riga lunga che inizia con `ssh-ed25519 AAAAC3...` e finisce con `plane-admin@windows`. **Copia tutta questa riga.**

### 3.2 Installare la chiave sul server

Sul server (console fisica per ora):

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

**Cosa fa:**
- `mkdir -p ~/.ssh` crea la directory `.ssh` nella tua home (se non esiste). `-p` evita errore se esiste già.
- `chmod 700 ~/.ssh` setta i permessi a "solo proprietario può leggere/scrivere/entrare" (SSH è paranoico sui permessi, se sono troppo aperti rifiuta di funzionare).
- `nano ~/.ssh/authorized_keys` apre l'editor di testo nano sul file `authorized_keys`.

Dentro nano: incolla la riga `ssh-ed25519 AAAA... plane-admin@windows` (tasto destro mouse incolla in PuTTY/console, oppure Ctrl+Maiusc+V se usi un terminale moderno). Salva con `Ctrl+O`, INVIO, `Ctrl+X`.

Imposta i permessi del file:
```bash
chmod 600 ~/.ssh/authorized_keys
```

Test dal tuo PC Windows:
```powershell
ssh plane@192.168.1.42
```

(usa l'IP del tuo server). Ti chiederà la passphrase della chiave (NON la password Linux). Una volta dentro vedi il prompt `plane@plane-server:~$`.

> [SCREENSHOT 7: terminale Windows con SSH connesso e prompt "plane@plane-server"]

### 3.3 Disabilitare login SSH con password (opzionale ma consigliato)

Solo dopo aver verificato che la chiave funziona:

```bash
sudo nano /etc/ssh/sshd_config
```

Cerca queste righe (tasto F6 per cercare in nano oppure Ctrl+W). Modificale così:
```
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
```

Se sono commentate (con `#` davanti) togli il `#`. Salva (Ctrl+O, INVIO, Ctrl+X).

Riavvia SSH:
```bash
sudo systemctl restart ssh
```

**⚠ NON CHIUDERE la sessione SSH attuale prima di aver verificato che una NUOVA sessione funziona.** Apri un secondo terminale Windows, prova a connetterti. Se funziona, ok. Se non funziona, dalla sessione vecchia rimedi prima di chiudere.

### 3.4 Firewall — UFW

Ubuntu ha UFW (Uncomplicated Firewall) preinstallato. Configurazione minima: SSH dal LAN, niente altro.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw enable
```

**Cosa fa:**
- `default deny incoming`: blocca tutto il traffico in entrata di default.
- `default allow outgoing`: permette tutto il traffico in uscita.
- `allow from 192.168.1.0/24 to any port 22`: permette SSH (porta 22) solo da dispositivi sulla tua LAN (sostituisci `192.168.1.0/24` con la tua subnet — `ip addr show` te la dice, è l'IP dopo `inet` con la maschera).
- `enable`: attiva il firewall.

Verifica:
```bash
sudo ufw status verbose
```

NB: non aprire le porte 80/443 sul firewall del server. Tailscale userà l'interfaccia virtuale `tailscale0` che bypassa UFW.

### 3.5 Auto-update di sicurezza

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Ti chiede se abilitare gli aggiornamenti automatici. Rispondi `<Yes>`. Da qui in poi le patch di sicurezza si installano da sole ogni notte.

> [SCREENSHOT 8: dialog ncurses "Configuring unattended-upgrades" con `<Yes>` selezionato]

---

## Step 4 — Installare Docker + Docker Compose

Plane gira come stack Docker. Installiamo Docker Engine + plugin compose v2 (la versione moderna che si invoca con `docker compose ...` senza trattino).

### 4.1 Installare Docker Engine

```bash
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

**Cosa fa (in sintesi):** aggiunge il repository ufficiale Docker, installa l'Engine e i plugin (buildx per build avanzati, compose per orchestrazione).

Verifica:
```bash
sudo docker version
sudo docker compose version
```

Devi vedere `Docker Engine - Community` e `Docker Compose version v2.x.x`.

### 4.2 Aggiungere il tuo utente al gruppo docker

Per non dover fare `sudo` ogni volta:

```bash
sudo usermod -aG docker plane
newgrp docker
```

**Cosa fa:** aggiunge l'utente `plane` al gruppo `docker` (i membri di questo gruppo possono usare Docker senza sudo). `newgrp docker` ricarica i gruppi nella sessione corrente; in alternativa fai logout+login.

Test (senza sudo):
```bash
docker run --rm hello-world
```

Deve scaricare un'immagine di test e stampare "Hello from Docker!".

### 4.3 Configurare i log driver di Docker

Di default Docker accumula log all'infinito. Limitiamoli per non riempire il disco:

```bash
sudo nano /etc/docker/daemon.json
```

Inserisci (è probabile che il file sia vuoto o non esista, va bene):

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Salva. Riavvia Docker:
```bash
sudo systemctl restart docker
```

Da qui in poi ogni container conserva massimo 30 MB di log (3 file da 10 MB), poi ruota.

---

## Step 5 — Creare account Tailscale e installare il client sul server

### 5.1 Creare l'account / Tailnet

Vai su [https://login.tailscale.com](https://login.tailscale.com) dal tuo PC Windows.

Clicca **Sign up**. Scegli un identity provider:

- **Google** (consigliato se hai Google Workspace aziendale)
- **Microsoft** (se hai Microsoft 365)
- **GitHub** (ok per dev)
- **Email** (genera password locale Tailscale)

Scegli quello che gli utenti useranno per loggarsi (devono avere lo stesso provider o uno tra quelli che abiliterai).

> [SCREENSHOT 9: pagina di login Tailscale con i 4 provider]

Dopo il login finisci nella **Admin Console** del tuo Tailnet. Il nome del tuo Tailnet di default è qualcosa tipo `mariorossi-gmail-com.ts.net`. Lo vedi in alto.

> [SCREENSHOT 10: Admin Console Tailscale, prima volta, vuota — sezione "Devices"]

### 5.2 Installare Tailscale sul server

Torna sulla sessione SSH del server e lancia il comando di installazione (preso da [https://tailscale.com/download/linux](https://tailscale.com/download/linux)):

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

**Cosa fa:** scarica e esegue lo script ufficiale Tailscale che aggiunge il loro repo apt, installa il pacchetto `tailscale`, abilita il daemon `tailscaled`.

Aspetta 1-2 minuti.

### 5.3 Connettere il server al Tailnet

```bash
sudo tailscale up --ssh
```

**Cosa fa:** registra il server nel tuo Tailnet. Il flag `--ssh` abilita Tailscale SSH (potrai SSH-are nel server da qualsiasi device del Tailnet senza chiave SSH separata, autenticato dall'identità Tailscale).

Il comando stampa una URL tipo:
```
To authenticate, visit:
  https://login.tailscale.com/a/abcdef123456
```

Apri questa URL nel browser del tuo PC Windows (devi essere già loggato Tailscale dallo Step 5.1). Conferma il device. Ti porta su una pagina "Success! You can now close this tab".

> [SCREENSHOT 11: pagina "Authenticate device" con il nome `plane-server` e bottone "Connect"]

Torna sul terminale del server. Vedi un IP `100.x.y.z` apparire. Verifica:

```bash
tailscale status
tailscale ip
```

Il primo elenca tutti i device del Tailnet (per ora solo questo server). Il secondo stampa l'IP Tailscale del server (sarà tipo `100.84.123.45`).

### 5.4 Disabilitare la "key expiry" sul server

Di default Tailscale rinnova le chiavi ogni 180 giorni: dopo questo periodo il server "scade" e va riautenticato manualmente. Per un server è scomodo. Disabilitiamolo:

Vai sull'Admin Console Tailscale → **Machines** → trova `plane-server` → click sui tre puntini → **Disable key expiry**.

> [SCREENSHOT 12: menu contestuale del device con "Disable key expiry" evidenziato]

Conferma. Ora il server resta autenticato indefinitamente.

### 5.5 MagicDNS

Su Admin Console → **DNS** → controlla che **MagicDNS** sia ATTIVO (toggle verde). Se non lo è, abilitalo. MagicDNS fa sì che gli utenti possano accedere al server via nome (`plane-server`) invece dell'IP `100.x.y.z`.

> [SCREENSHOT 13: pagina DNS con MagicDNS = "Enabled"]

---

## Step 6 — Configurare HTTPS via Tailscale Serve

Tailscale Serve dà al tuo server un certificato HTTPS valido senza dover comprare un dominio o configurare Let's Encrypt manualmente. Funziona così: Tailscale ti dà un hostname `plane-server.<tailnet>.ts.net`, genera un certificato Let's Encrypt valido per quel nome, e lo configura in automatico.

### 6.1 Abilitare HTTPS sul Tailnet

Admin Console → **DNS** → scorri fino a **HTTPS Certificates** → click **Enable HTTPS**.

> [SCREENSHOT 14: sezione HTTPS Certificates con bottone "Enable HTTPS"]

Conferma. Da questo momento il tuo Tailnet può richiedere certificati per i suoi device.

### 6.2 Configurare Tailscale Serve sul server

Per ora salta questo step e torna qui dopo lo Step 10 (avvio Plane). Tailscale Serve ha bisogno di un servizio HTTP attivo dietro per testare il funzionamento. Annoto qui i comandi per quando tornerai:

```bash
# Stoppa eventuali serve precedenti
sudo tailscale serve reset

# Espone Plane (proxy interno su porta 80) come HTTPS sulla porta 443 del Tailnet
sudo tailscale serve --bg https / http://localhost:80

# Verifica configurazione
tailscale serve status
```

Output atteso dopo il setup:
```
https://plane-server.<tailnet>.ts.net (tailnet only)
|-- / proxy http://localhost:80
```

A questo punto, da qualsiasi device Tailscale, aprire `https://plane-server.<tailnet>.ts.net` raggiunge la tua istanza Plane in HTTPS. Lascia questo comando in background (`--bg`) — sopravvive ai reboot.

> Nota: il valore `<tailnet>` lo trovi in alto a destra nell'Admin Console (es. `mariorossi-gmail-com.ts.net`).

### 6.3 Annota l'URL finale

Una volta fatto lo Step 6.2 il tuo URL Plane sarà:

```
https://plane-server.<tuo-tailnet>.ts.net
```

Esempio: `https://plane-server.mariorossi-gmail-com.ts.net`. Annotalo, lo userai allo Step 9 nella `WEB_URL` di Plane.

---

## Step 7 — Trasferire le immagini Docker dal tuo PC Windows

Il `build.bat` sul tuo Windows produce due immagini: `plane-web-custom:latest` e `plane-api-custom:latest`. Le esportiamo in un file tar e le copiamo sul server.

### 7.1 Esportare le immagini

Sul **PC Windows** (PowerShell o CMD):

```powershell
cd C:\Users\acamp
docker save plane-web-custom:latest plane-api-custom:latest -o plane-images.tar
```

**Cosa fa:** crea un singolo file tar con entrambe le immagini. Sarà ~2-3 GB. Aspetta 1-2 min.

### 7.2 Trasferire al server via SCP

Sempre dal PC Windows:

```powershell
scp plane-images.tar plane@plane-server:/home/plane/
```

**Cosa fa:** copia il file via SSH al server. Hostname `plane-server` funziona perché Tailscale MagicDNS è attivo (sei tu stesso nel Tailnet, perché hai installato Tailscale anche sul Windows? Se non l'hai ancora fatto fallo ora — vai su [https://tailscale.com/download](https://tailscale.com/download), installa il client Windows, login, sei dentro il Tailnet).

Trasferimento: dipende dalla LAN. Su Gigabit Ethernet ~30 secondi. Su Wi-Fi 5GHz ~2 min.

> Se preferisci puoi usare un client SCP grafico tipo WinSCP — stessa cosa.

### 7.3 Caricare le immagini sul server

SSH nel server:

```bash
ssh plane@plane-server
```

Poi:

```bash
docker load -i /home/plane/plane-images.tar
```

**Cosa fa:** carica le immagini dal tar nel registry locale Docker del server.

Verifica:
```bash
docker images | grep plane
```

Devi vedere:
```
plane-web-custom    latest    abc123...   N minutes ago    XXX MB
plane-api-custom    latest    def456...   N minutes ago    XXX MB
```

Cancella il tar (occupa spazio inutile):
```bash
rm /home/plane/plane-images.tar
```

---

## Step 8 — Preparare la directory di runtime sul server

Plane ha un `docker-compose.yml` ufficiale che lanciamo in un override per usare le nostre immagini custom.

### 8.1 Creare la directory

```bash
mkdir -p ~/plane-app
cd ~/plane-app
```

### 8.2 Scaricare il setup script ufficiale Plane

Il modo più semplice è usare il loro installer che genera `docker-compose.yml` e `plane.env` con i default sensati:

```bash
curl -fsSL https://raw.githubusercontent.com/makeplane/plane/master/setup.sh -o setup.sh
chmod +x setup.sh
sudo ./setup.sh install
```

**Cosa fa:** scarica lo script, lo rende eseguibile, lo lancia. Lo script chiede il dominio principale di Plane (digita `plane-server.<tailnet>.ts.net` quando chiede "DOMAIN_NAME"), genera la configurazione e ti porta in una shell di amministrazione Plane con il menu di scelta operazioni.

Esci dal menu (digita `0` o Ctrl+C). I file `docker-compose.yml` e `plane.env` ora sono in `/opt/plane`.

### 8.3 Spostare i file in ~/plane-app

```bash
sudo cp /opt/plane/docker-compose.yml ~/plane-app/
sudo cp /opt/plane/plane.env ~/plane-app/
sudo chown plane:plane ~/plane-app/*
```

**Cosa fa:** copia i file generati dallo setup script nella tua home, e imposta l'utente `plane` come proprietario (così puoi modificarli senza sudo).

### 8.4 Creare il file di override per le immagini custom

```bash
nano ~/plane-app/docker-compose.override.yml
```

Incolla:

```yaml
services:
  web:
    image: plane-web-custom:latest
  api:
    image: plane-api-custom:latest
  worker:
    image: plane-api-custom:latest
  beat-worker:
    image: plane-api-custom:latest
  migrator:
    image: plane-api-custom:latest
```

Salva (Ctrl+O, INVIO, Ctrl+X).

**Cosa fa:** Docker Compose unisce automaticamente `docker-compose.yml` e `docker-compose.override.yml`. L'override sovrascrive solo l'`image:` dei 5 servizi che noi customizziamo (web frontend + 4 servizi backend che condividono la stessa immagine API).

---

## Step 9 — Configurare le variabili d'ambiente di Plane

Il file `plane.env` contiene tutta la configurazione runtime. I default vanno bene per il 90%, dobbiamo solo settare alcune cose specifiche del nostro deploy.

```bash
nano ~/plane-app/plane.env
```

Modifica/aggiungi queste righe (cerca con Ctrl+W):

```bash
# === URL pubblico ===
WEB_URL=https://plane-server.<tuo-tailnet>.ts.net
APP_BASE_URL=https://plane-server.<tuo-tailnet>.ts.net
CORS_ALLOWED_ORIGINS=https://plane-server.<tuo-tailnet>.ts.net

# === Database (Postgres - lascia i default che genera setup.sh) ===
# POSTGRES_USER=plane
# POSTGRES_PASSWORD=<auto-generata-dal-setup-script>
# POSTGRES_DB=plane
# PGDATA=/var/lib/postgresql/data

# === Secret keys (DEVI cambiare questi se setup.sh non l'ha già fatto) ===
SECRET_KEY=<genera-con-comando-sotto>

# === SMTP (opzionale, per email Plane / RSVP magic link) ===
# Lasciale come da setup.sh, le configuriamo da god-mode dopo
```

Per generare un secret key forte:

```bash
docker run --rm python:3.11 python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Copia l'output (60 caratteri tipo `Yhl3pK_w...`) e mettilo dentro `SECRET_KEY=...`.

Sostituisci `<tuo-tailnet>` con il valore esatto del tuo Tailnet (es. `mariorossi-gmail-com.ts.net`).

Salva ed esci.

---

## Step 10 — Avviare Plane

```bash
cd ~/plane-app
docker compose --env-file plane.env up -d
```

**Cosa fa:**
- `cd` ti porta nella directory che contiene i compose files.
- `docker compose up -d` legge `docker-compose.yml` + `docker-compose.override.yml`, scarica le immagini stock necessarie (postgres, redis, ecc.), usa le custom dove specificato, crea la rete Docker, parte tutti i servizi in background (`-d` = detached).

Aspetta 2-3 minuti. La prima volta i container fanno migration del DB e caricamento iniziale.

Verifica stato:
```bash
docker compose ps
```

Tutti i container devono essere `running` o `Up X seconds (healthy)`. Se uno è in `restarting` o `unhealthy`, qualcosa non va — vedi sezione [Comandi di emergenza](#comandi-di-emergenza-e-troubleshooting).

Test rapido HTTP locale:
```bash
curl -I http://localhost:80
```

Deve rispondere con `HTTP/1.1 200 OK` o redirect.

### 10.1 Configurare Tailscale Serve (torno qui dallo Step 6.2)

Ora che Plane è attivo:

```bash
sudo tailscale serve reset
sudo tailscale serve --bg https / http://localhost:80
tailscale serve status
```

Output atteso:
```
https://plane-server.<tailnet>.ts.net (tailnet only)
|-- / proxy http://localhost:80
```

Apri il browser sul tuo PC Windows (con Tailscale attivo) e vai a `https://plane-server.<tailnet>.ts.net`. **Devi vedere la pagina di login di Plane in HTTPS valido (lucchetto verde)**.

> [SCREENSHOT 15: browser con Plane caricato in HTTPS, lucchetto verde, URL https://plane-server...ts.net]

🎉 Se vedi la pagina di login Plane, il deploy infrastruttura è fatto.

---

## Step 11 — Configurazione iniziale di Plane (admin, workspace)

### 11.1 Creare l'utente admin

Sulla pagina di login Plane, click "Sign up". Inserisci:
- Email: la tua email aziendale
- Password: una forte (gestore password)

Conferma. Ti chiede di creare un primo Workspace.

### 11.2 Creare il workspace

- Workspace name: es. "Oniro" o nome della tua azienda
- Workspace URL: lo slug (es. `oniro`)
- Workspace Type: scegli quella che ti rappresenta meglio

> [SCREENSHOT 16: pagina "Create your workspace" con i campi compilati]

Confermi e arrivi nella home del workspace.

### 11.3 Configurare SMTP per le email Plane

Plane ha una "God Mode" admin che permette di configurare l'invio email senza modificare l'env file.

Vai su `https://plane-server.<tailnet>.ts.net/god-mode/`. Login con il tuo account admin.

> [SCREENSHOT 17: pannello God Mode con menu laterale e sezione Email]

Sezione **Email** → inserisci i parametri SMTP del tuo provider:
- Email host: es. `smtp.oniro.tech` (per il tuo caso)
- Email host user: l'utenza
- Email host password: la password
- Email port: 465 (SSL) o 587 (TLS)
- Email from: es. `noreply@oniro.tech`
- Use TLS: spunta in base al tuo provider
- Use SSL: spunta se porta 465

Salva. Test invio: la pagina ha un bottone "Send test email" — usalo per verificare che arrivi davvero.

### 11.4 Creare i progetti iniziali

Torna nel workspace. Crea un primo progetto di test, alcuni task. Verifica che la UI risponda fluida.

---

## Step 12 — Backup automatico verso Backblaze B2

I backup sono **vitali**. Senza, alla prima rottura del disco perdi tutto. Schema: dump giornaliero del DB + sync della directory MinIO, upload off-site su Backblaze B2 (o simile).

### 12.1 Creare account Backblaze B2

Vai su [https://www.backblaze.com/b2](https://www.backblaze.com/b2). Sign up gratuito. Verifica email.

Nel pannello B2:
1. Crea un bucket: nome `plane-backups-<azienda>`, type **Private**.
2. Vai su **App Keys** → **Add a New Application Key**:
   - Name: `plane-server-backup`
   - Allow access to: `plane-backups-<azienda>` (solo questo bucket, non globale)
   - Type: Read and Write
3. Salva le credenziali generate (`keyID` e `applicationKey`) — le vedi una volta sola, copia subito.

> [SCREENSHOT 18: pannello B2 con application key generata, evidenziati keyID e applicationKey]

### 12.2 Installare rclone sul server

`rclone` è il tool standard per sync/backup verso storage cloud.

```bash
curl https://rclone.org/install.sh | sudo bash
```

### 12.3 Configurare rclone con B2

```bash
rclone config
```

Risponde:
- `n` (new remote)
- name: `b2backup`
- Storage: scegli `Backblaze B2` (numero corrispondente nella lista, di solito 7-8)
- account: incolla `keyID` da B2
- key: incolla `applicationKey` da B2
- hard_delete: lascia false (default)
- Edit advanced config: `n`
- Confirm: `y`
- Quit: `q`

Verifica:
```bash
rclone ls b2backup:plane-backups-<azienda>
```

Deve rispondere senza errori (lista vuota se è un bucket nuovo).

### 12.4 Script di backup

```bash
mkdir -p ~/scripts
nano ~/scripts/plane-backup.sh
```

Incolla:

```bash
#!/bin/bash
# Plane backup script - daily Postgres dump + MinIO rsync + B2 upload
# Path mantenuti per 7 giorni locale, 90 giorni cloud.

set -e

BACKUP_ROOT="/var/backups/plane"
DATE=$(date +%Y-%m-%d)
LOG="/var/log/plane-backup.log"
BUCKET="b2backup:plane-backups-$(hostname)"

mkdir -p "$BACKUP_ROOT/db" "$BACKUP_ROOT/uploads"

echo "[$(date)] Starting backup" >> "$LOG"

# 1. Postgres dump
docker exec plane-app-plane-db-1 pg_dump -U plane -d plane | gzip > "$BACKUP_ROOT/db/plane-$DATE.sql.gz"
echo "[$(date)] DB dumped" >> "$LOG"

# 2. MinIO uploads (rsync incrementale del volume)
docker run --rm -v plane-app_uploads:/source:ro -v "$BACKUP_ROOT/uploads":/target alpine rsync -a /source/ /target/ 2>/dev/null || true
# (rsync non sempre nell'image alpine, fallback semplice cp:)
docker run --rm -v plane-app_uploads:/source:ro -v "$BACKUP_ROOT/uploads":/target alpine sh -c "cp -ru /source/. /target/"
echo "[$(date)] MinIO synced" >> "$LOG"

# 3. Upload to B2 (rclone fa solo il delta)
rclone sync "$BACKUP_ROOT" "$BUCKET" --transfers 4 --b2-hard-delete=false >> "$LOG" 2>&1
echo "[$(date)] B2 sync complete" >> "$LOG"

# 4. Pulizia locale (mantieni solo ultimi 7 dump DB)
find "$BACKUP_ROOT/db" -name "plane-*.sql.gz" -type f -mtime +7 -delete
echo "[$(date)] Local cleanup done" >> "$LOG"

echo "[$(date)] Backup OK" >> "$LOG"
```

Salva. Permessi:
```bash
chmod +x ~/scripts/plane-backup.sh
sudo mkdir -p /var/backups/plane /var/log
sudo touch /var/log/plane-backup.log
sudo chown plane:plane /var/log/plane-backup.log /var/backups/plane
```

Test manuale:
```bash
~/scripts/plane-backup.sh
cat /var/log/plane-backup.log
```

Verifica su B2 (refresh pannello web): vedi i file caricati nel bucket.

### 12.5 Schedulare con cron

```bash
crontab -e
```

(la prima volta chiede quale editor, scegli nano = `1`).

In fondo aggiungi:
```
0 3 * * * /home/plane/scripts/plane-backup.sh >> /var/log/plane-backup.log 2>&1
```

**Cosa fa:** ogni giorno alle 03:00 esegue lo script di backup.

Salva ed esci. Verifica che cron lo riconosca:
```bash
crontab -l
```

### 12.6 Test di restore (FONDAMENTALE)

Senza un test di restore i tuoi backup sono inutili. Almeno una volta dopo il primo deploy, prova:

```bash
# Scarica l'ultimo backup
rclone copy b2backup:plane-backups-$(hostname)/db/plane-$(date +%Y-%m-%d).sql.gz /tmp/

# Decomprimi
gunzip /tmp/plane-$(date +%Y-%m-%d).sql.gz

# Conta tabelle (deve essere ~150-200 per Plane)
grep "CREATE TABLE" /tmp/plane-$(date +%Y-%m-%d).sql | wc -l
```

Se vedi ~150+ righe, il dump è valido. Per un restore vero su un secondo ambiente seguirai una procedura più articolata (copia il dump, ricrea container db, `psql -f`...).

---

## Step 13 — Onboarding utenti su Tailscale

Per ogni utente che vuoi dare accesso a Plane:

### 13.1 Invitarli via Admin Console

Vai su [https://login.tailscale.com](https://login.tailscale.com) → **Users** → **Invite users**.

Inserisci email aziendale degli utenti. Manda l'invito.

> [SCREENSHOT 19: Tailscale Admin Console "Invite users" dialog]

L'utente riceve un'email con link.

### 13.2 Onboarding del singolo utente

Manda all'utente queste istruzioni (puoi copincollarle):

> Ciao! Per accedere a Plane, segui questi 3 passi:
>
> 1. **Apri l'invito Tailscale che hai ricevuto via email** e clicca "Accept Invitation". Fai login con il tuo account Google/Microsoft aziendale.
>
> 2. **Installa il client Tailscale** sul tuo dispositivo:
>    - Windows/Mac: [https://tailscale.com/download](https://tailscale.com/download)
>    - iOS/Android: cerca "Tailscale" nello store
>
> 3. **Apri il client Tailscale** e fai login con lo stesso account dell'invito. Vedrai uno switch "Connected".
>
> Da ora in poi, quando il client Tailscale è acceso, **apri il browser su `https://plane-server.<tailnet>.ts.net`** e accedi a Plane normalmente. Quando spegni Tailscale, l'URL non funziona più (è invisibile dal resto di internet).
>
> Sui telefoni il client Tailscale può restare sempre acceso, consuma pochissimo. Se ti dà fastidio puoi accenderlo solo quando ti serve Plane.
>
> Per qualsiasi problema scrivi a `<tu>@<azienda>.it`.

### 13.3 Restrictions (opzionale, quando hai >10 utenti)

Per default tutti gli utenti del Tailnet vedono tutti i device. Se vuoi che solo alcuni vedano `plane-server`:

Admin Console → **Access Controls** → modifica le ACL JSON per definire gruppi e permessi. Esempio:

```json
{
  "groups": {
    "group:plane-users": ["alice@example.com", "bob@example.com"]
  },
  "acls": [
    {
      "action": "accept",
      "src": ["group:plane-users"],
      "dst": ["plane-server:443", "plane-server:80"]
    }
  ]
}
```

Salva. Ora solo Alice e Bob possono raggiungere Plane.

---

## Step 14 — Aggiornamenti futuri

Quando vuoi deployare una nuova versione (es. v1.35c, v1.36):

### 14.1 Build locale

Sul tuo Windows:

```cmd
cd C:\Users\acamp\plane-custom
git pull
build.bat
```

Aspetta che finisca (~10-15 min).

### 14.2 Esportare le immagini aggiornate

```powershell
docker save plane-web-custom:latest plane-api-custom:latest -o plane-images.tar
```

### 14.3 Trasferire al server

```powershell
scp plane-images.tar plane@plane-server:/home/plane/
```

### 14.4 Caricare e riavviare sul server

SSH:
```bash
ssh plane@plane-server
```

Carica le nuove immagini:
```bash
docker load -i /home/plane/plane-images.tar
rm /home/plane/plane-images.tar
```

Applica migrations DB (se la release ha cambiato il modello, es. v1.34a, v1.35a):
```bash
cd ~/plane-app
docker compose --env-file plane.env run --rm migrator python manage.py migrate
```

Ricrea i container con le immagini nuove:
```bash
docker compose --env-file plane.env up -d --force-recreate web api worker beat-worker
```

Verifica:
```bash
docker compose ps
```

Il badge in Plane (sidebar in basso) deve riflettere la nuova versione (es. `PATCHED v1.35c`).

### 14.5 Pulizia delle immagini vecchie

Periodicamente (ogni 1-2 mesi):

```bash
docker image prune -a -f
```

**Cosa fa:** rimuove le immagini Docker non utilizzate da nessun container running. Libera spazio.

### 14.6 Rollback in caso di problemi

Se la nuova versione è rotta puoi tornare alla precedente solo se hai conservato l'immagine vecchia. Best practice: tagga le immagini prima di sovrascriverle:

```bash
# Prima del docker load di una nuova versione
docker tag plane-web-custom:latest plane-web-custom:backup-$(date +%Y%m%d)
docker tag plane-api-custom:latest plane-api-custom:backup-$(date +%Y%m%d)
```

Per fare rollback:
```bash
docker tag plane-web-custom:backup-20260504 plane-web-custom:latest
docker tag plane-api-custom:backup-20260504 plane-api-custom:latest
docker compose --env-file plane.env up -d --force-recreate web api worker beat-worker
```

---

## Comandi di emergenza e troubleshooting

### Container in stato anomalo

```bash
docker compose ps                              # vedi stato
docker compose logs <servizio> --tail 100      # ultimi 100 log
docker compose logs <servizio> -f              # log live (Ctrl+C per uscire)
docker compose restart <servizio>              # restart singolo
```

Esempio: `docker compose logs api --tail 200`

### Plane non si carica nel browser

1. Tailscale è connesso? `tailscale status` sul tuo client + sul server
2. URL corretto? `tailscale serve status` sul server, deve listare `https://plane-server.<tailnet>.ts.net`
3. Plane è up? `docker compose ps` sul server, tutti `running`
4. Test curl interno: `curl -I http://localhost:80` sul server

### Disco pieno

```bash
df -h                                          # spazio usato
docker system df                               # spazio Docker
docker system prune -a -f --volumes            # pulisce immagini/container/volumi orfani (⚠ NON tocca volumi attivi)
```

### Restart pulito di tutto Plane

```bash
cd ~/plane-app
docker compose --env-file plane.env down
docker compose --env-file plane.env up -d
```

### Plane mostra "Internal Server Error" 500 dopo update

Probabilmente migrations non applicate:
```bash
cd ~/plane-app
docker compose --env-file plane.env run --rm migrator python manage.py migrate
docker compose --env-file plane.env restart api worker beat-worker
```

### Backup non funziona

```bash
cat /var/log/plane-backup.log                  # log script
~/scripts/plane-backup.sh                      # esecuzione manuale, vedi errore
rclone ls b2backup:plane-backups-...           # B2 raggiungibile?
```

### "Permission denied" SSH dopo modifiche

Se rompi SSH config e non riesci più a entrare, hai due opzioni:
1. Console fisica (tastiera + monitor sul server fisico) e modifichi `/etc/ssh/sshd_config` da li
2. Tailscale SSH come fallback: `tailscale ssh plane@plane-server` (funziona anche senza chiave SSH normale)

Per questo è importante che `tailscale up --ssh` sia attivo SEMPRE.

### Aggiornare Tailscale stesso

```bash
sudo apt update && sudo apt upgrade -y tailscale
sudo systemctl restart tailscaled
tailscale status     # verifica ancora connesso
```

---

## Reference rapido

### Comandi che userai ogni giorno

| Cosa | Comando |
|---|---|
| SSH nel server | `ssh plane@plane-server` |
| Stato containers | `cd ~/plane-app && docker compose ps` |
| Log live di un servizio | `docker compose logs -f api` |
| Restart Plane | `docker compose --env-file plane.env restart` |
| Backup manuale | `~/scripts/plane-backup.sh` |
| Stato Tailscale | `tailscale status` |
| Spazio disco | `df -h` |

### Path importanti sul server

| Path | Cosa contiene |
|---|---|
| `~/plane-app/docker-compose.yml` | Compose principale (gestito da Plane) |
| `~/plane-app/docker-compose.override.yml` | Override per immagini custom |
| `~/plane-app/plane.env` | Variabili d'ambiente |
| `/var/lib/docker/volumes/plane-app_pgdata` | Database Postgres |
| `/var/lib/docker/volumes/plane-app_uploads` | Allegati MinIO |
| `/var/backups/plane/` | Backup locali |
| `~/scripts/plane-backup.sh` | Script di backup |
| `/var/log/plane-backup.log` | Log dei backup |

### Risorse

- Plane docs: https://docs.plane.so/self-hosting
- Tailscale docs: https://tailscale.com/kb
- Backblaze B2: https://www.backblaze.com/b2/docs
- Repo plane-custom: https://github.com/Seltyiel/plane-custom
- Patch notes: `CHANGELOG.md` nel repo

---

## Checklist deployment completato

Quando hai finito, conferma di aver fatto tutto:

- [ ] PC con UPS e BIOS settato per riavvio automatico dopo blackout
- [ ] Ubuntu Server 24.04 LTS installato
- [ ] IP statico riservato sul router
- [ ] SSH key configurata, password login disabilitato
- [ ] UFW firewall attivo, solo SSH dalla LAN
- [ ] Docker + Compose installati
- [ ] Tailscale installato sul server, key expiry disabilitata
- [ ] MagicDNS abilitato sul Tailnet
- [ ] HTTPS Certificates abilitato sul Tailnet
- [ ] Tailscale Serve attivo (HTTPS / → http://localhost:80)
- [ ] Immagini `plane-web-custom`, `plane-api-custom` caricate sul server
- [ ] `docker-compose.yml` + override + `plane.env` configurati
- [ ] WEB_URL settato all'URL Tailscale
- [ ] Plane raggiungibile via `https://plane-server.<tailnet>.ts.net`
- [ ] Admin user creato, primo workspace creato
- [ ] SMTP configurato in God Mode, test email inviato
- [ ] Backup script schedulato in cron, primo backup verificato su B2
- [ ] Restore test completato (almeno conta delle tabelle)
- [ ] Almeno 1 utente test invitato in Tailscale e ha verificato accesso

Quando sono tutti spuntati, sei in produzione. 🚀
