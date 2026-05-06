# Plane-custom — Infrastruttura multi-tenant (Hyper-V)

> Versione 1.0 — setup di un host Windows Server con Hyper-V che ospita N VM Ubuntu, una per azienda cliente. Ogni VM esegue il proprio stack Plane indipendente con Tailnet dedicato.
>
> **Scenario corrente**: 2 aziende, 15 utenti ciascuna, host con 2 dischi (un SSD piccolo per Windows + un disco più grande SSD/HDD per le VM e i backup locali).

Questo documento copre il setup dell'**host fisico e infrastruttura virtualizzazione**. Per il setup applicativo di una **singola istanza Plane dentro una VM**, vedi `DEPLOYMENT.md` (a cui questo doc rimanda dove serve).

## Indice

1. [Architettura finale](#1-architettura-finale)
2. [Inventario e prerequisiti](#2-inventario-e-prerequisiti)
3. [Parte A — Install Windows Server](#parte-a--install-windows-server)
4. [Parte B — Setup Hyper-V](#parte-b--setup-hyper-v)
5. [Parte C — Networking virtuale](#parte-c--networking-virtuale)
6. [Parte D — Storage layout](#parte-d--storage-layout)
7. [Parte E — VM template Ubuntu (golden image)](#parte-e--vm-template-ubuntu-golden-image)
8. [Parte F — Clonare il template per ogni azienda](#parte-f--clonare-il-template-per-ogni-azienda)
9. [Parte G — Tailscale per-tenant](#parte-g--tailscale-per-tenant)
10. [Parte H — Deploy Plane per-tenant](#parte-h--deploy-plane-per-tenant)
11. [Parte I — Operations: update workflow](#parte-i--operations-update-workflow)
12. [Parte J — Backup multi-tenant](#parte-j--backup-multi-tenant)
13. [Parte K — Snapshot Hyper-V e disaster recovery](#parte-k--snapshot-hyper-v-e-disaster-recovery)
14. [Troubleshooting host](#troubleshooting-host)
15. [Reference rapido](#reference-rapido)

---

## 1. Architettura finale

```
┌─────────────────────────────────────────────────────────────────┐
│ HOST FISICO (PC dedicato)                                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐     │
│  │ Windows Server 2022 Standard                           │     │
│  │                                                        │     │
│  │  ┌──────────────────────────────────────────────────┐ │     │
│  │  │ Hyper-V (hypervisor)                              │ │     │
│  │  │                                                   │ │     │
│  │  │  ┌────────────────────┐  ┌────────────────────┐ │ │     │
│  │  │  │ VM "plane-aziendaA" │  │ VM "plane-aziendaB" │ │ │     │
│  │  │  │ Ubuntu 24.04        │  │ Ubuntu 24.04        │ │ │     │
│  │  │  │ Docker + Plane stack│  │ Docker + Plane stack│ │ │     │
│  │  │  │ Tailscale (Tailnet A)│ │ Tailscale (Tailnet B)│ │     │
│  │  │  │ 4 vCPU, 12 GB RAM   │  │ 4 vCPU, 12 GB RAM   │ │ │     │
│  │  │  │ 100 GB vhdx (SSD)   │  │ 100 GB vhdx (SSD)   │ │ │     │
│  │  │  └────────────────────┘  └────────────────────┘ │ │     │
│  │  │                                                   │ │     │
│  │  │  Virtual Switch "External" (bridge a NIC fisico) │ │     │
│  │  └──────────────────┬───────────────────────────────┘ │     │
│  │                     │                                  │     │
│  │  Operations PowerShell scripts:                       │     │
│  │   - update-all.ps1  (deploy nuove immagini)           │     │
│  │   - snapshot-all.ps1 (snapshot Hyper-V settimanali)   │     │
│  │   - health-check.ps1 (status VM + container)          │     │
│  │                                                        │     │
│  │  Storage:                                              │     │
│  │   E:\VMs\plane-aziendaA\*.vhdx (disco grande)         │     │
│  │   E:\VMs\plane-aziendaB\*.vhdx (disco grande)         │     │
│  │   E:\Snapshots\* (snapshot e backup locali)           │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                 │
│         Router LAN ─── Internet (per Tailscale uscente)        │
└─────────────────────────────────────────────────────────────────┘

Utenti azienda A ──► Tailnet A ──► VM plane-aziendaA ──► Plane A
Utenti azienda B ──► Tailnet B ──► VM plane-aziendaB ──► Plane B
```

**Punti chiave:**
- Le due VM sono completamente isolate: DB, MinIO, Tailscale, utenti.
- Le due aziende non si vedono tra loro: ognuna ha il suo Tailnet con il suo dominio aziendale.
- Tu (MSP) hai accesso amministrativo a entrambi i Tailnet (sei stato invitato come admin) e all'host fisico.
- Update applicativo: una sola build sul tuo Windows, deploy parallelo sulle 2 VM via script PowerShell.
- Backup: 2 stream paralleli verso 2 bucket Backblaze B2 distinti.

---

## 2. Inventario e prerequisiti

### Hardware host (PC esistente)

Prima di iniziare verifica:

```powershell
# Sul PC che diventerà l'host (anche su Windows attuale):
Get-WmiObject Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors
Get-WmiObject Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum | %{$_.Sum / 1GB}
Get-PhysicalDisk | Format-Table FriendlyName, MediaType, Size
```

**Requisiti minimi confermati:**
- CPU: 6+ core fisici / 12+ thread, supporto Intel VT-x / AMD-V (richiesto per Hyper-V — quasi sempre presente da 10 anni a questa parte)
- RAM: 32+ GB (16 sono troppo stretti per 2 VM da 12 GB ciascuna + Windows host che si prende 4-6 GB)
- Disco: idealmente 1 SSD da 256+ GB per Windows + 1 SSD/HDD da 500+ GB per le VM e backup locali. Se hai un solo disco da 1 TB, OK lo stesso (vedi Parte D per layout). Setup minimo verificato: SSD 120 GB (Windows) + SSD 480 GB (VMs).

> ⚠ **Verifica supporto virtualizzazione hardware**: nel BIOS, abilita "Intel Virtualization Technology (VT-x)" o "AMD-V". Spesso è disabilitato di default. Senza di esso Hyper-V rifiuta di avviare le VM.

### Software/account

- [ ] Licenza Windows Server 2022 Standard (confermata posseduta)
- [ ] ISO di Windows Server 2022 ([download Microsoft Eval Center](https://www.microsoft.com/it-it/evalcenter/evaluate-windows-server-2022) — anche se non eval, l'ISO è la stessa, attivi con la chiave dopo)
- [ ] ISO di Ubuntu Server 24.04 LTS ([download Ubuntu](https://ubuntu.com/download/server))
- [ ] Chiavetta USB 16 GB
- [ ] Account Tailscale separato per ogni azienda (li creeranno loro o tu per loro conto, vedi Parte G)
- [ ] Account Backblaze B2 (1 o 2, decideremo a Parte J)
- [ ] UPS APC ~700-950VA (in lista materiali, da acquistare prima di andare in produzione)

### Network info da raccogliere

Sul router della LAN dove starà il server:
- [ ] **Subnet**: es. `192.168.1.0/24`
- [ ] **Gateway**: es. `192.168.1.1`
- [ ] **DNS server**: es. `192.168.1.1` o `1.1.1.1` / `8.8.8.8`
- [ ] **3 IP fissi disponibili** (uno per host Windows Server, uno per ogni VM):
  - Es. `192.168.1.40` → host Windows Server
  - Es. `192.168.1.41` → VM aziendaA
  - Es. `192.168.1.42` → VM aziendaB
  - Va bene qualsiasi terna fuori dal range DHCP, riservata staticamente sul router.

---

## Parte A — Install Windows Server

### A.1 Creare la chiavetta USB di installazione

Sul tuo PC Windows attuale:
1. Scarica l'ISO di Windows Server 2022.
2. Scarica [Rufus](https://rufus.ie).
3. Apri Rufus, inserisci chiavetta da 16 GB, seleziona ISO, partition scheme **GPT**, file system **NTFS**, click START.

> [SCREENSHOT 1: Rufus configurato per Windows Server 2022 ISO]

### A.2 Bootare e installare Windows Server

1. Inserisci chiavetta nel PC server, boot dalla USB (tasto F12/F11/ESC al boot, dipende dal BIOS).
2. **Lingua/tastiera**: Italiano o English. Suggerisco English per evitare ambiguità nei comandi PowerShell.
3. **Installa ora** → inserisci product key (o "I don't have a product key" se vuoi attivare dopo).
4. **Edizione**: scegli **Windows Server 2022 Standard (Desktop Experience)**. ⚠ NON scegliere "Server Core" (no GUI, gestione solo da PowerShell — più ostico se è la prima volta).
5. **Tipo install**: "Custom: Install Microsoft Server Operating System only".
6. **Disco**: seleziona l'**SSD più piccolo** (quello su cui ospiterai solo Windows + Hyper-V management). Le VM andranno sul disco più grande. Se ha partizioni vecchie, eliminale tutte e crea una nuova "New" → installa.
7. Aspetta ~15-20 min per l'install.
8. **Password Administrator**: scegli una forte (gestore password). Non perderla — senza non rientri.
9. Login con utente **Administrator** + password.

> [SCREENSHOT 2: Server Manager aperto al primo accesso]

### A.3 Configurazione iniziale

Apri **Server Manager** (parte automaticamente, altrimenti taskbar → icona col simbolo di un mattoncino).

**Local Server** (in alto a sinistra del menu) → cambia:

1. **Computer name**: click su nome attuale (tipo `WIN-XXX`) → "Change" → digita `plane-host` → OK → conferma riavvio dopo.
2. **Time zone**: assicurati sia "(UTC+01:00) Rome" o equivalente.
3. **IE Enhanced Security Configuration**: settalo OFF per Administrators (così puoi navigare senza popup di blocco quando scarichi cose).
4. **Windows Update**: configurato per "Automatic" o "Scheduled". Lascia standard.

Riavvia.

### A.4 Configurare l'IP statico dell'host

Server Manager → **Local Server** → click su "Ethernet" (vicino a IP) → si apre Network Connections → tasto destro su "Ethernet" → Properties → "Internet Protocol Version 4 (TCP/IPv4)" → Properties.

Inserisci:
- IP: `192.168.1.40`
- Subnet mask: `255.255.255.0`
- Default gateway: `192.168.1.1` (il tuo router)
- Preferred DNS: `1.1.1.1`
- Alternate DNS: `8.8.8.8`

OK, OK. Test: apri PowerShell e fai `ping google.com`. Deve rispondere.

### A.5 Abilitare RDP (Remote Desktop)

Per amministrare l'host da remoto (dal tuo PC Windows quotidiano) senza tastiera/monitor fisici:

Server Manager → **Local Server** → "Remote Desktop" cambia da "Disabled" a **Enabled**.

> [SCREENSHOT 3: dialog "System Properties" → Remote → "Allow remote connections to this computer" attivo]

Conferma. Dal tuo Windows quotidiano apri **Remote Desktop Connection** (cerca "mstsc"), digita `192.168.1.40`, login con `Administrator` + password. Dovresti entrare nel desktop dell'host.

D'ora in poi puoi staccare tastiera e monitor dal server (tienili a portata di mano per emergenze).

### A.6 Hardening base

Dal PowerShell amministrativo (tasto destro su Start → "Windows PowerShell (Admin)"):

```powershell
# Firewall: blocca tutto in entrata tranne RDP, ICMP (ping), porte usate da Hyper-V e backup
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True

# Verifica RDP regola attiva
Get-NetFirewallRule -DisplayGroup "Remote Desktop" | Where-Object Enabled -eq True
```

**Cosa fa:**
- `Set-NetFirewallProfile` abilita Windows Firewall su tutti i profili di rete.
- `Get-NetFirewallRule` verifica che la regola RDP sia attiva.

Imposta auto-update di sicurezza:

```powershell
# Apre la GUI di Windows Update settings (più semplice da impostare visualmente)
control update
```

Configura **"Automatic Updates"** in modalità "Notify but do not auto-restart". Su un host che ospita VM evitiamo riavvii automatici.

---

## Parte B — Setup Hyper-V

### B.1 Installare il ruolo Hyper-V

Server Manager → **Manage** (in alto a destra) → **Add Roles and Features**.

Wizard:
1. Before You Begin → Next.
2. Installation Type → "Role-based or feature-based installation" → Next.
3. Server Selection → seleziona il server locale `plane-host` → Next.
4. Server Roles → spunta **Hyper-V** → quando chiede di aggiungere feature dependencies clicca "Add Features" → Next.
5. Features → lascia default → Next.
6. Hyper-V → Next.
7. **Create Virtual Switches** → seleziona la NIC fisica del server (la "Ethernet" che usi per la LAN). Questo crea automaticamente il virtual switch "External" che servirà alle VM. → Next.
8. Migration → "No, do not allow this server to send and receive live migrations" → Next.
9. Default Stores → lascia default per ora, li cambieremo a Parte D → Next.
10. Confirmation → spunta "Restart automatically if required" → Install.

> [SCREENSHOT 4: wizard "Add Roles and Features" su sezione Hyper-V con Add Features popup]

L'install dura ~5 min, poi richiede **2 riavvii automatici**. Lascia che il server si riavvii. Aspetta ~5-10 minuti, poi rientra via RDP.

### B.2 Verifica Hyper-V attivo

PowerShell admin:
```powershell
Get-WindowsFeature -Name Hyper-V*
```

Tutti devono mostrare "Installed".

```powershell
Get-VMHost | Format-List
```

Mostra le info dell'host Hyper-V (versione, virtualization extensions, ecc.).

Apri **Hyper-V Manager** dal Start Menu. Vedi l'host `plane-host` listato a sinistra.

> [SCREENSHOT 5: Hyper-V Manager con plane-host listato e nessuna VM]

---

## Parte C — Networking virtuale

### C.1 Verificare il Virtual Switch "External"

In Hyper-V Manager → click destro su `plane-host` → **Virtual Switch Manager**.

Dovresti vedere uno switch chiamato qualcosa tipo "Realtek PCIe ... - Virtual Switch" (creato automaticamente dal wizard Hyper-V).

> [SCREENSHOT 6: Virtual Switch Manager con lo switch External]

Rinominalo per chiarezza:
- Click sullo switch → cambia "Name" in `vSwitch-LAN`.
- Verify "External network" è selezionato e punta alla tua NIC fisica.
- "Allow management operating system to share this network adapter" deve essere **spuntato** (così l'host Windows continua a usare la stessa NIC per la sua connessione).
- Click **OK**.

Test: dopo il salvataggio l'host potrebbe perdere la connessione di rete per 5-10 secondi. Aspetta, se RDP cade riconnettiti.

### C.2 Configurare DNS pass-through (opzionale ma utile)

Le VM useranno il router come DNS di default. Se vuoi che l'host Windows abbia un nome DNS interno per le VM (es. `plane-aziendaA.local`) puoi configurare il file hosts del router, ma per il nostro caso non serve — useremo Tailscale MagicDNS che è più semplice.

---

## Parte D — Storage layout

### D.1 Inizializzare il secondo disco

Per default Windows monta solo il disco di sistema. Apri **Disk Management** (Win+X → Disk Management).

Vedi 2 dischi:
- **Disco di sistema** (più piccolo, in genere 120-256 GB): contiene `C:\` con Windows
- **Secondo disco** (più grande, 480+ GB): "Unallocated" o "Offline" — è qui che andranno le VM e i backup locali

> ⚠ Importante: le VM finiscono sul **disco più grande**, non su `C:\`. Il disco di sistema è troppo piccolo per ospitare 2+ VM da 40-100 GB ciascuna. Anche se entrambi i tuoi dischi sono SSD, le VM vanno comunque sul più grande per avere spazio.

Click destro sul secondo disco:
- Se è "Offline" → "Online".
- Click destro sullo spazio "Unallocated" → "New Simple Volume" → Next → assegna lettera **E:\** → format come **NTFS** con label `Storage` (o `Data`) → Next → Finish.

> [SCREENSHOT 7: Disk Management con C:\ (sistema) e E:\ (storage VM + backup)]

### D.2 Creare le directory di storage

PowerShell admin:

```powershell
# Tutto su E: (disco grande): VM + snapshot + backup staging + ISO
New-Item -ItemType Directory -Path "E:\VMs" -Force
New-Item -ItemType Directory -Path "E:\VMs\Templates" -Force
New-Item -ItemType Directory -Path "E:\VMs\plane-aziendaA" -Force
New-Item -ItemType Directory -Path "E:\VMs\plane-aziendaB" -Force
New-Item -ItemType Directory -Path "E:\Snapshots" -Force
New-Item -ItemType Directory -Path "E:\BackupStaging" -Force
New-Item -ItemType Directory -Path "E:\Iso" -Force  # qui mettiamo l'ISO Ubuntu
```

**Cosa fa:** crea le directory che useremo per organizzare VM, snapshot, ISO. `New-Item -Force` non fallisce se esistono già.

> Se hai un solo disco fisico (caso non consigliato ma possibile per dev/staging), sostituisci tutte le occorrenze di `E:\` con `C:\` in questa Parte e nelle successive — assicurati però di avere almeno 200 GB liberi su `C:\` prima di partire.

### D.3 Configurare Hyper-V default paths

Hyper-V Manager → click destro su `plane-host` → **Hyper-V Settings**:
- **Virtual Hard Disks** → cambia in `E:\VMs`
- **Virtual Machines** → cambia in `E:\VMs`

Click OK.

Oppure via PowerShell:
```powershell
Set-VMHost -VirtualMachinePath "E:\VMs" -VirtualHardDiskPath "E:\VMs"
```

Da qui in poi Hyper-V crea le nuove VM in `E:\VMs` di default.

### D.4 Scaricare ISO Ubuntu sull'host

Apri browser sull'host (Edge), scarica `ubuntu-24.04.x-live-server-amd64.iso` da [https://ubuntu.com/download/server](https://ubuntu.com/download/server). Salvala in `E:\Iso\ubuntu-server-24.04.iso`.

---

## Parte E — VM template Ubuntu (golden image)

L'idea è creare **una sola** VM Ubuntu con tutto preinstallato (Docker, Tailscale, utility), poi clonarla per ogni azienda. Risparmi 30 min per ogni nuova VM.

### E.1 Creare la VM template

Hyper-V Manager → click destro su `plane-host` → **New** → **Virtual Machine**.

Wizard:
1. Before You Begin → Next.
2. Specify Name and Location → Name: `plane-template` → "Store the virtual machine in a different location" spuntato → Location: `E:\VMs\Templates` → Next.
3. Specify Generation → **Generation 2** (UEFI, più moderno e supportato da Ubuntu 22.04+) → Next.
4. Assign Memory → 4096 MB iniziale, "Use Dynamic Memory" → spuntato → Next.
5. Configure Networking → Connection → `vSwitch-LAN` → Next.
6. Connect Virtual Hard Disk → "Create a virtual hard disk":
   - Name: `plane-template.vhdx`
   - Location: `E:\VMs\Templates\`
   - Size: **40 GB** (template è leggero, ridimensionabile)
   - Next.
7. Installation Options → "Install an operating system from a bootable image file" → Browse `E:\Iso\ubuntu-server-24.04.iso` → Next.
8. Summary → Finish.

> [SCREENSHOT 8: Hyper-V Manager con la VM template appena creata, in stato Off]

### E.2 Disabilitare Secure Boot per Ubuntu

Generation 2 ha Secure Boot attivo di default, ma il bootloader Ubuntu 24.04 non è firmato Microsoft (uses Canonical's). Per Ubuntu Server 24.04 è OK perché Microsoft supporta i bootloader Canonical, ma per sicurezza disabilitiamolo:

Click destro sulla VM `plane-template` → **Settings** → "Hardware" sezione → **Security** → uncheck "Enable Secure Boot" (oppure cambia template a "Microsoft UEFI Certificate Authority"). Apply.

### E.3 Aumentare CPU della VM template

Settings → **Processor** → Number of virtual processors: **4** → OK.

### E.4 Avviare l'install Ubuntu

Click destro VM → **Connect** → si apre la console virtuale → click **Start**.

Ubuntu installer parte. Procedura **identica a `DEPLOYMENT.md` Step 1.4**, ma:
- Hostname: digita `plane-template` (lo cambieremo per ogni clone).
- Username: `plane`.
- Spunta "Install OpenSSH server".
- DHCP per ora (statico verrà configurato sui cloni).

Aspetta ~10 min, riavvia, login.

### E.5 Aggiornare il sistema

Via console Hyper-V:
```bash
sudo apt update && sudo apt upgrade -y
```

### E.6 Installare Docker

Esegui i comandi della **Sezione "Step 4 — Installare Docker + Docker Compose" di `DEPLOYMENT.md`**. Sintesi:

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker plane
```

Configura log driver:
```bash
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
sudo systemctl restart docker
```

### E.7 Installare Tailscale (ma NON connetterlo ancora)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

NON eseguire `tailscale up` — la connessione al Tailnet la facciamo dopo il clone, una per ogni azienda nel suo Tailnet specifico.

### E.8 Installare utility utili

```bash
sudo apt install -y rclone htop ncdu git tree jq curl wget unzip
```

**Cosa servono:**
- `rclone` per backup B2 (lo configureremo dopo)
- `htop` per monitoring CPU/RAM interattivo
- `ncdu` per vedere chi sta usando spazio disco (`ncdu /`)
- `git`, `jq`, ecc. per script vari

### E.9 Pulizia per template

Pulisci log, hostname machine-id, SSH keys (verranno rigenerate al boot del clone):

```bash
sudo apt autoremove -y
sudo apt autoclean
sudo rm -rf /var/lib/apt/lists/*
sudo apt update

# Pulisci log per minimizzare il vhdx
sudo journalctl --rotate
sudo journalctl --vacuum-time=1s
sudo find /var/log -type f -name "*.log" -exec truncate -s 0 {} \;

# Reset machine-id (Ubuntu lo rigenera al boot)
sudo truncate -s 0 /etc/machine-id
sudo rm /var/lib/dbus/machine-id
sudo ln -s /etc/machine-id /var/lib/dbus/machine-id

# Reset SSH host keys (verranno rigenerate)
sudo rm -f /etc/ssh/ssh_host_*

# Pulizia history
history -c && history -w
sudo cat /dev/null > ~/.bash_history
```

### E.10 Spegnere la VM template

```bash
sudo shutdown -h now
```

Aspetta che Hyper-V Manager mostri la VM in stato "Off".

### E.11 Compattare il vhdx

Dal PowerShell amministrativo dell'host:

```powershell
Optimize-VHD -Path "E:\VMs\Templates\plane-template.vhdx" -Mode Full
```

**Cosa fa:** rimuove gli zeroed-block del disco virtuale, riduce il file a dimensione minima. Il `.vhdx` passa da ~10 GB a ~3-4 GB. Velocizzerà i clone successivi.

### E.12 Marcare la VM come template

Hyper-V Manager → click destro su `plane-template` → **Rename** → cambia in `plane-template-DO-NOT-START`. Questo evita di accenderla per errore (ogni accensione modifica il vhdx e ti tocca rifare la pulizia).

> [SCREENSHOT 9: Hyper-V Manager con la VM template rinominata e Off]

---

## Parte F — Clonare il template per ogni azienda

Ora cloniamo il template per creare la prima VM aziendale.

### F.1 Copiare il vhdx del template

PowerShell admin:

```powershell
Copy-Item -Path "E:\VMs\Templates\plane-template.vhdx" `
          -Destination "E:\VMs\plane-aziendaA\plane-aziendaA.vhdx"
```

Aspetta 30-60 secondi (copia 3-5 GB su SSD).

### F.2 Creare nuova VM che usa il vhdx clonato

Hyper-V Manager → New → Virtual Machine:
1. Name: `plane-aziendaA` → Location: `E:\VMs\plane-aziendaA`
2. Generation 2
3. Memory: **12288 MB** (12 GB) + Dynamic Memory spuntato (lo cambieremo a fissi sotto)
4. Networking: `vSwitch-LAN`
5. Connect Virtual Hard Disk: **"Use an existing virtual hard disk"** → Browse → `E:\VMs\plane-aziendaA\plane-aziendaA.vhdx`
6. Finish.

### F.3 Configurare CPU + memory + Secure Boot

Settings della nuova VM:
- **Hardware → Processor**: Number of virtual processors = **4**
- **Hardware → Memory**: Startup RAM = **12288 MB**, Dynamic Memory spuntato (range 4096-12288), Memory weight = High (priorità su altre VM se RAM stretta)
- **Hardware → Security**: uncheck Secure Boot (come template)
- **Management → Integration Services**: tutti spuntati (di default sono già spuntati)
- **Management → Automatic Start Action**: "Automatically start if it was running when the service stopped" + Startup delay 60 secondi (da fare per tutte le VM, sfasa l'avvio così non saturano risorse al boot)
- **Management → Automatic Stop Action**: "Save" (se Hyper-V deve fermare la VM, salva lo stato)

### F.4 Avviare la VM clonata e configurarla

Click destro → Start → Connect.

Login `plane` / password originale del template.

#### F.4.1 Cambia hostname

```bash
sudo hostnamectl set-hostname plane-aziendaA
```

#### F.4.2 IP statico

Identifica l'interfaccia:
```bash
ip addr show
```

Cerca `eth0` o `enp...` (su Hyper-V tipicamente è `eth0`).

Modifica netplan:
```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

Sostituisci con (adatta i valori alla tua subnet):
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      addresses:
        - 192.168.1.41/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

Salva.

```bash
sudo netplan apply
```

Verifica: `ip addr show eth0` deve mostrare `192.168.1.41`. Test: `ping google.com`.

#### F.4.3 Riserva DHCP sul router

Sul router della LAN, aggiungi una DHCP reservation:
- MAC: usa quello mostrato da `ip addr show eth0` (link/ether)
- IP: `192.168.1.41`

Questo evita conflitti se per qualche motivo netplan ricadesse su DHCP.

#### F.4.4 Rigenera SSH host keys (best practice anche se reboot lo fa)

```bash
sudo dpkg-reconfigure openssh-server
sudo systemctl restart ssh
```

#### F.4.5 Reboot per validare tutto

```bash
sudo reboot
```

Quando torna up, prova SSH dal tuo Windows quotidiano:
```powershell
ssh plane@192.168.1.41
```

Se chiede "host key fingerprint" rispondi `yes`. (Su Tailscale dopo non importerà, ma per ora SSH classico dalla LAN è il modo per verificare che la VM funzioni.)

### F.5 Ripeti F.1–F.4 per la seconda azienda

Stessi passi, sostituendo:
- `aziendaA` → `aziendaB`
- IP `192.168.1.41` → `192.168.1.42`
- hostname `plane-aziendaA` → `plane-aziendaB`

A fine Parte F hai 2 VM Ubuntu pronte, ognuna con il proprio IP statico, accessibili via SSH dalla LAN.

---

## Parte G — Tailscale per-tenant

Ogni azienda ha il suo Tailnet. La regia:

- **Azienda A (con SSO Google/Microsoft)**: l'azienda crea il proprio Tailnet ([https://login.tailscale.com](https://login.tailscale.com)) usando il loro account Google Workspace / Microsoft 365 aziendale. Ti invitano come admin del loro Tailnet.
- **Azienda B (senza SSO)**: l'azienda non ha SSO. Crei il Tailnet **a loro nome** (con un'email tua "operativa", es. `plane-msp+aziendaB@tuodominio.it`). Inviti gli utenti via email Tailscale individuale.

### G.1 Tailnet azienda A — onboarding

L'azienda A:
1. Va su [https://login.tailscale.com/admin/welcome](https://login.tailscale.com/admin/welcome).
2. Sign up con il loro Google Workspace o Microsoft 365 (admin del dominio).
3. Tailnet name di default sarà tipo `aziendaa-com.ts.net`.
4. Va su **Settings → User Management → Invite users** e ti invita come `tu@tuamsp.it`.
5. Tu accetti l'invito, sei membro del Tailnet azienda A.

Dopo, va su **Settings → Members** e promuove il tuo account a **Admin** (così puoi gestire il Tailnet anche senza che loro siano connessi).

> [SCREENSHOT 10: Tailscale Admin Console di azienda A con te listato come Admin]

### G.2 Connettere VM aziendaA al Tailnet di azienda A

SSH nella VM:
```bash
ssh plane@192.168.1.41
```

Connetti al Tailnet di azienda A (devi essere loggato Tailscale come membro di quel Tailnet — Tailscale usa la tua identità per identificare il Tailnet di destinazione):

```bash
sudo tailscale up --ssh --hostname=plane-aziendaA
```

Ti dà un URL `https://login.tailscale.com/a/...`. Aprilo nel browser sul tuo PC (deve essere l'identità con cui sei admin del Tailnet di azienda A — se hai più Tailnet, fai logout e login con la giusta identità prima).

Una volta autenticato, sull'admin console di azienda A vedi `plane-aziendaA` apparire in **Machines**.

Disabilita key expiry:
- Admin console → Machines → `plane-aziendaA` → tre puntini → **Disable key expiry**.

### G.3 Abilitare HTTPS via Tailscale Serve

Sul Tailnet di azienda A:
- Admin console → **DNS** → **MagicDNS** = ENABLED
- **HTTPS Certificates** → **Enable HTTPS**

Sulla VM:
```bash
sudo tailscale serve reset
sudo tailscale serve --bg https / http://localhost:80
tailscale serve status
```

Output atteso:
```
https://plane-aziendaA.aziendaa-com.ts.net (tailnet only)
|-- / proxy http://localhost:80
```

Annota l'URL: `https://plane-aziendaA.aziendaa-com.ts.net` (l'esatto nome del tailnet vedrai nell'output). Lo userai nel `WEB_URL` di Plane (Parte H).

### G.4 Tailnet azienda B — variante senza SSO

Variante differente dato che azienda B non ha SSO:

1. **Tu** vai su [https://login.tailscale.com](https://login.tailscale.com).
2. Sign up con un'email "operativa" (es. `plane-msp+aziendaB@tuodominio.it` se hai Gmail accetta `+` aliasing).
3. Crei il Tailnet con identità email + password.
4. Tailnet name di default sarà tipo `plane-msp-aziendab-tuodominio-it.ts.net` (modifica in Settings → Tailnet name → digita `aziendaB`).
5. Inviti gli utenti azienda B via email (Settings → User Management → Invite users → inserisci email e mandane).
6. Quando ricevono l'invito loro creano un account Tailscale con la stessa email + password.

Per la VM aziendaB, ripeti G.2/G.3 connettendo al Tailnet di azienda B.

### G.5 Ripeti G.2/G.3 per VM aziendaB

Stessi passi della VM aziendaA, sostituendo:
- Tailnet target: quello di azienda B (assicurati di essere loggato Tailscale come admin di quello, NON di A — Tailscale ha "user switcher" in alto a destra dell'admin console)
- Hostname: `plane-aziendaB`
- URL finale: tipo `https://plane-aziendaB.aziendab.ts.net`

A fine Parte G:
- VM aziendaA accessibile in HTTPS via il suo Tailnet
- VM aziendaB accessibile in HTTPS via il suo Tailnet
- I due Tailnet non si "vedono" tra loro: utenti A non possono raggiungere VM B e viceversa

---

## Parte H — Deploy Plane per-tenant

A questo punto ogni VM ha tutto pronto (Ubuntu, Docker, Tailscale + HTTPS). Manca solo deployare lo stack Plane sopra.

Per ogni VM (aziendaA, aziendaB):

### H.1 Trasferisci immagini Docker custom dal tuo Windows

Sul tuo PC Windows quotidiano (con Tailscale attivo, membro di entrambi i Tailnet di A e di B):

```powershell
# Build (se non già fatto)
cd C:\Users\acamp\plane-custom
.\build.bat

# Esporta
cd C:\Users\acamp
docker save plane-web-custom:latest plane-api-custom:latest -o plane-images.tar

# Trasferisci su VM A
scp plane-images.tar plane@plane-aziendaA:/home/plane/

# Trasferisci su VM B
scp plane-images.tar plane@plane-aziendaB:/home/plane/
```

**Tip**: gli hostname `plane-aziendaA` / `plane-aziendaB` funzionano grazie a Tailscale MagicDNS, ma solo se sei loggato Tailscale al rispettivo Tailnet. Alternativa: usare gli IP LAN `192.168.1.41` / `192.168.1.42` se tu sei nella stessa LAN del server.

### H.2 Sulla VM, carica e deploy

SSH nella VM, segui **`DEPLOYMENT.md` da Step 7.3 in poi**:
- Step 7.3 — `docker load -i plane-images.tar`
- Step 8 — preparare `~/plane-app` (download docker-compose.yml ufficiale Plane)
- Step 9 — configurare `plane.env` con il **WEB_URL specifico del Tailnet** (es. `https://plane-aziendaA.aziendaa-com.ts.net`)
- Step 10 — avviare Plane con `docker compose up -d`
- Step 11 — primo admin + workspace

Ripeti per la seconda VM, ovviamente con il suo WEB_URL.

A fine Parte H ogni azienda ha la sua istanza Plane attiva e accessibile dal proprio Tailnet.

---

## Parte I — Operations: update workflow

Ogni release plane-custom (es. v1.35c, v1.36, ...) deve essere deployata su entrambe le VM. Automatizziamo con uno script PowerShell sull'host.

### I.1 Setup chiavi SSH dall'host alle VM

Dall'host Windows Server PowerShell:

```powershell
# Genera key se non esiste
if (-not (Test-Path "$env:USERPROFILE\.ssh\id_ed25519")) {
    ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519" -N '""'
}

# Mostra la chiave pubblica
cat "$env:USERPROFILE\.ssh\id_ed25519.pub"
```

Copia l'output. Su ogni VM:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAA... administrator@plane-host' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Test:
```powershell
ssh plane@plane-aziendaA "echo OK"
ssh plane@plane-aziendaB "echo OK"
```

Devono stampare `OK` senza chiedere password.

### I.2 Script PowerShell di update

Sull'host, crea `C:\Scripts\update-all.ps1`:

```powershell
# Plane multi-tenant update script
# Uso: .\update-all.ps1 [-DryRun]

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$VMs = @(
    @{ Name = "plane-aziendaA"; Host = "192.168.1.41" },
    @{ Name = "plane-aziendaB"; Host = "192.168.1.42" }
)

$ImagesPath = "C:\Users\acamp\plane-images.tar"

# 1. Verifica che il tar esista
if (-not (Test-Path $ImagesPath)) {
    Write-Host "❌ $ImagesPath non trovato. Esegui build.bat e docker save prima." -ForegroundColor Red
    exit 1
}

$Size = (Get-Item $ImagesPath).Length / 1GB
Write-Host "✅ plane-images.tar trovato ($('{0:N2}' -f $Size) GB)" -ForegroundColor Green

if ($DryRun) {
    Write-Host "DRY RUN — nessun comando verrà eseguito sulle VM." -ForegroundColor Yellow
}

# 2. Per ogni VM: scp + load + restart
foreach ($vm in $VMs) {
    $name = $vm.Name
    $host = $vm.Host
    Write-Host "`n=== $name ($host) ===" -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host "[dry] scp $ImagesPath plane@${host}:/home/plane/"
        Write-Host "[dry] ssh plane@$host 'docker load -i ...'"
        Write-Host "[dry] ssh plane@$host 'cd ~/plane-app && docker compose ... up -d'"
        continue
    }

    # Backup tag immagini correnti (per rollback)
    $today = Get-Date -Format "yyyyMMdd"
    Write-Host "[1/4] Backup tag immagini correnti..."
    ssh plane@$host "docker tag plane-web-custom:latest plane-web-custom:backup-$today 2>/dev/null || true"
    ssh plane@$host "docker tag plane-api-custom:latest plane-api-custom:backup-$today 2>/dev/null || true"

    # SCP del tar
    Write-Host "[2/4] Copia plane-images.tar..."
    scp $ImagesPath plane@${host}:/home/plane/

    # Load + cleanup
    Write-Host "[3/4] Load immagini + applica migrations + restart..."
    ssh plane@$host @"
docker load -i /home/plane/plane-images.tar
rm /home/plane/plane-images.tar
cd ~/plane-app
docker compose --env-file plane.env run --rm migrator python manage.py migrate
docker compose --env-file plane.env up -d --force-recreate web api worker beat-worker
"@

    # Verifica
    Write-Host "[4/4] Verifica stato container..."
    ssh plane@$host "cd ~/plane-app && docker compose ps --format 'table {{.Name}}\t{{.Status}}'"

    Write-Host "✅ $name aggiornato" -ForegroundColor Green
}

Write-Host "`n🎉 Update completato su tutte le VM." -ForegroundColor Green
```

### I.3 Workflow di rilascio

Quando hai una nuova release plane-custom:

```powershell
# Su Windows quotidiano (dove builda)
cd C:\Users\acamp\plane-custom
git pull
.\build.bat

# Esporta immagini
cd C:\Users\acamp
docker save plane-web-custom:latest plane-api-custom:latest -o plane-images.tar

# Trasferisci tar all'host (se la build è su un PC diverso dall'host Windows Server)
scp plane-images.tar Administrator@plane-host:C:/Users/acamp/

# Sull'host, lancia update di tutte le VM
ssh Administrator@plane-host "powershell C:\Scripts\update-all.ps1"
```

Tempo totale per release: ~5-10 min (build già fatto + scp + 2 deploy paralleli).

> Nota: lo script processa le VM in serie. Se vuoi parallelizzare per ridurre downtime, puoi sostituire il `foreach` con `ForEach-Object -Parallel` (PowerShell 7+).

### I.4 Rollback in caso di bug

Se la nuova release rompe qualcosa, sull'host:

```powershell
ssh plane@plane-aziendaA @"
docker tag plane-web-custom:backup-20260504 plane-web-custom:latest
docker tag plane-api-custom:backup-20260504 plane-api-custom:latest
cd ~/plane-app
docker compose --env-file plane.env up -d --force-recreate web api worker beat-worker
"@
```

(sostituisci la data del backup tag con quella che hai disponibile)

---

## Parte J — Backup multi-tenant

Strategia: **2 bucket Backblaze B2 distinti**, uno per azienda. Ogni VM esegue il proprio script di backup giornaliero verso il proprio bucket.

### J.1 Crea 2 account/bucket Backblaze

Per cleanness, suggerisco:
- **Account Backblaze 1**: `tu+aziendaA@tuodominio.it` → bucket `plane-aziendaA-backups`
- **Account Backblaze 2**: `tu+aziendaB@tuodominio.it` → bucket `plane-aziendaB-backups`

Oppure 1 account tuo con 2 bucket. Per separazione contabile/legale e per poter "consegnare" il bucket all'azienda se cambia provider, avere account separati è più pulito. **Decidi tu**, l'effetto tecnico è identico.

In ogni account:
1. Crea bucket Private.
2. App Key con accesso solo a quel bucket, Type Read/Write. Salva keyID + applicationKey.

### J.2 Sulla VM aziendaA: configura rclone + script

SSH nella VM, segui **`DEPLOYMENT.md` Sezione "Step 12 — Backup automatico"** completa:
- 12.2 Installa rclone (è già installato dal template, salta)
- 12.3 `rclone config` → remote name `b2backup`, credenziali del bucket di azienda A
- 12.4 Crea `~/scripts/plane-backup.sh` (uguale al doc)
- 12.5 Schedula in cron alle 03:00

### J.3 Ripeti J.2 sulla VM aziendaB

Stesso script, MA con credenziali rclone del bucket di azienda B.

> **Importante**: lo script usa `b2backup:plane-backups-$(hostname)` come destinazione. Siccome l'hostname della VM aziendaB è `plane-aziendaB`, il bucket finirà su `plane-backups-plane-aziendaB` — non quello che vuoi se tu hai chiamato il bucket `plane-aziendaB-backups`. Modifica la riga `BUCKET=` nello script per usare il nome esatto del tuo bucket per quella azienda, es. `BUCKET="b2backup:plane-aziendaB-backups"`.

### J.4 Verifica backup giornaliero

Dopo il primo run a 03:00 (o manuale):
```bash
cat /var/log/plane-backup.log    # sulla VM
# oppure dall'host: ssh plane@plane-aziendaA "cat /var/log/plane-backup.log"
```

E sul pannello Backblaze, refresh del bucket: vedi `db/plane-2026-05-05.sql.gz` e `uploads/...`.

### J.5 Test restore (FONDAMENTALE)

Almeno una volta a quadrimestre, prova a restorare un backup su una VM "scratch" (clonata dal template). Procedura:
1. Crea VM `plane-scratch` clonando template.
2. Avvia, configura DHCP/IP non in conflitto.
3. Configura rclone con accesso read-only al bucket di una delle due aziende.
4. Scarica l'ultimo dump: `rclone copy b2backup:plane-aziendaA-backups/db/plane-LATEST.sql.gz /tmp/`.
5. Crea container Postgres temporaneo, fai `psql -f` del dump.
6. Verifica numero tabelle, righe campione, ecc.
7. Distruggi VM scratch.

Se il test va a buon fine, sei coperto.

---

## Parte K — Snapshot Hyper-V e disaster recovery

Oltre ai backup applicativi (giornalieri, granulari), Hyper-V permette **snapshot della VM intera**: cattura RAM + disco in uno stato consistente, ripristinabile in 1 click. Utile per:
- Prima di un update rischioso (rollback istantaneo se rompe)
- Disaster recovery (ripristino di tutta la VM senza riconfigurare nulla)
- Backup "ultima spiaggia" (se i backup applicativi sono corrotti)

### K.1 Snapshot manuale prima di update

Prima di un update major, dall'host PowerShell:

```powershell
$Date = Get-Date -Format "yyyyMMdd-HHmm"
Checkpoint-VM -Name "plane-aziendaA" -SnapshotName "before-update-$Date"
Checkpoint-VM -Name "plane-aziendaB" -SnapshotName "before-update-$Date"
```

Il checkpoint dura 10-30 secondi (la VM continua a girare durante la creazione, salva delta successivamente).

Dopo l'update, se tutto OK, **cancella i checkpoint vecchi** (occupano spazio e degradano performance):

```powershell
Get-VMSnapshot -VMName "plane-aziendaA" | Where-Object { $_.Name -like "before-update-*" -and $_.CreationTime -lt (Get-Date).AddDays(-7) } | Remove-VMSnapshot
```

### K.2 Snapshot settimanali automatici

Crea `C:\Scripts\weekly-snapshot.ps1`:

```powershell
$Date = Get-Date -Format "yyyyMMdd"
$VMs = @("plane-aziendaA", "plane-aziendaB")

foreach ($vm in $VMs) {
    Write-Host "Snapshot $vm..."
    Checkpoint-VM -Name $vm -SnapshotName "weekly-$Date"

    # Mantieni solo gli ultimi 4 weekly snapshot per VM
    Get-VMSnapshot -VMName $vm |
        Where-Object { $_.Name -like "weekly-*" } |
        Sort-Object CreationTime -Descending |
        Select-Object -Skip 4 |
        Remove-VMSnapshot
}
```

Schedula con Task Scheduler (Win+R → `taskschd.msc`):
- Trigger: ogni domenica alle 02:00
- Action: `powershell.exe -ExecutionPolicy Bypass -File C:\Scripts\weekly-snapshot.ps1`

> [SCREENSHOT 11: Task Scheduler con il task settimanale snapshot configurato]

### K.3 Restore da snapshot

Se la VM si rompe e devi tornare a uno stato precedente:

Hyper-V Manager → click destro sulla VM → **Revert** (torna all'ultimo checkpoint) o **Apply** (sceglie un checkpoint specifico).

Conferma. La VM viene riportata allo stato di quel checkpoint, **inclusa la RAM**: se la VM era running quando hai fatto il checkpoint, riparte running con esattamente lo stesso stato. Se era off, torna off.

⚠ **Nota**: il revert è **distruttivo** — perdi tutti i cambiamenti tra lo snapshot e il presente. Per Plane questo significa: se il checkpoint è di lunedì e oggi è venerdì, perdi 4 giorni di dati. Per questo i checkpoint sono backup "ultima spiaggia" — i backup applicativi giornalieri (dump Postgres) sono il primo strumento.

### K.4 Export di una VM intera (disaster recovery)

Se vuoi una copia "trasportabile" della VM (es. per migrare a un altro host o conservarla off-site):

```powershell
Export-VM -Name "plane-aziendaA" -Path "E:\Snapshots\Exports\plane-aziendaA-$(Get-Date -Format 'yyyyMMdd')"
```

Crea una cartella con il `.vhdx` + metadati. Pesa parecchio (50-100 GB), ma puoi importarla su un altro host Hyper-V con `Import-VM`.

Se hai un NAS, puoi schedulare un export mensile verso il NAS come "vera" copia off-site della VM (oltre ai backup applicativi su B2).

---

## Troubleshooting host

### VM non parte: "Cannot start virtual machine because the hypervisor is not running"

```powershell
bcdedit /set hypervisorlaunchtype auto
shutdown /r /t 0
```

Se il problema persiste, verifica nel BIOS che VT-x/AMD-V sia attivato.

### VM lentissima sotto carico

Controlla over-commit:
```powershell
Get-VM | Format-Table Name, State, MemoryAssigned, MemoryDemand, CPUUsage
```

Se `MemoryDemand` è ~uguale a `MemoryAssigned` per tutte le VM → host saturo, alza la RAM totale o riduci la RAM massima delle VM.

### Snapshot crea problemi a Plane (DB corrotto al revert)

Postgres NON è "snapshot-friendly" durante write attivi. Best practice prima di snapshot critici:

```bash
ssh plane@plane-aziendaA "cd ~/plane-app && docker compose stop"
# fai snapshot
# poi:
ssh plane@plane-aziendaA "cd ~/plane-app && docker compose start"
```

Per snapshot settimanali sotto carico leggero (notte), lo script rischia consistency issues ma in pratica per Plane (DB di pochi GB) è OK il 99% delle volte. Comunque, **i backup applicativi (pg_dump) sono PIÙ AFFIDABILI dei snapshot Hyper-V** per quanto riguarda DB.

### RDP non si connette dopo riavvio

Aspetta 2-3 minuti dopo il restart (Windows Server impiega un po' a portare su tutti i servizi). Se ancora non risponde, console fisica + verifica `Get-Service -Name TermService`.

### Una VM consuma troppa CPU dell'host

```powershell
Get-VM | Sort-Object CPUUsage -Descending | Format-Table Name, CPUUsage, MemoryAssigned
```

Identifica la VM rumorosa. SSH dentro:
```bash
htop
```

Trova il processo. Solitamente per Plane: `postgres` durante backup, `celery worker` per task pesanti, oppure un attaccante che brute-force se Plane è esposto (non dovrebbe essere il tuo caso con Tailscale).

### Disco SSD pieno

```powershell
# Vedi consumo per cartella (richiede installare WinDirStat o usare PowerShell)
Get-ChildItem E:\VMs -Recurse | Measure-Object -Property Length -Sum
```

Likely culprits:
- Snapshot Hyper-V vecchi non rimossi (`E:\Snapshots`)
- vhdx delle VM cresciuti (Plane MinIO uploads accumulano file)

Compatta i vhdx (richiede stop VM):
```powershell
Stop-VM -Name "plane-aziendaA"
Optimize-VHD -Path "E:\VMs\plane-aziendaA\plane-aziendaA.vhdx" -Mode Full
Start-VM -Name "plane-aziendaA"
```

---

## Reference rapido

### Comandi PowerShell host più utili

| Cosa | Comando |
|---|---|
| Lista VM e stato | `Get-VM` |
| Avvia VM | `Start-VM -Name plane-aziendaA` |
| Ferma VM (gentile, save state) | `Stop-VM -Name plane-aziendaA -Save` |
| Ferma VM (brutale) | `Stop-VM -Name plane-aziendaA -Force` |
| Snapshot manuale | `Checkpoint-VM -Name plane-aziendaA -SnapshotName "test"` |
| Lista snapshot | `Get-VMSnapshot -VMName plane-aziendaA` |
| Revert ultimo snapshot | (via GUI Hyper-V Manager) |
| SSH in una VM | `ssh plane@plane-aziendaA` |
| Update bulk | `C:\Scripts\update-all.ps1` |
| Snapshot settimanale | `C:\Scripts\weekly-snapshot.ps1` |
| RAM totale assegnata vs disponibile | `Get-VM \| Measure-Object MemoryAssigned -Sum` |
| Spazio dischi | `Get-PSDrive C, E` |

### Path importanti sull'host

| Path | Cosa contiene |
|---|---|
| `E:\VMs\Templates\plane-template.vhdx` | Template Ubuntu (golden image) |
| `E:\VMs\plane-aziendaA\plane-aziendaA.vhdx` | Disco virtuale azienda A |
| `E:\VMs\plane-aziendaB\plane-aziendaB.vhdx` | Disco virtuale azienda B |
| `E:\Snapshots\` | Snapshot Hyper-V settimanali |
| `E:\BackupStaging\` | Staging backup (riservato per uso futuro) |
| `E:\Iso\` | ISO Ubuntu/Windows |
| `C:\Scripts\update-all.ps1` | Update bulk script |
| `C:\Scripts\weekly-snapshot.ps1` | Weekly snapshot script |

### URL di accesso utenti

| Azienda | URL Plane |
|---|---|
| A | `https://plane-aziendaA.<tailnet-A>.ts.net` |
| B | `https://plane-aziendaB.<tailnet-B>.ts.net` |

(Il `<tailnet-X>` lo trovi nell'admin console Tailscale di ciascuna azienda.)

### Cosa documentare PER OGNI azienda

Per non perderti tra A e B, mantieni un foglio (es. file Excel cifrato in OneDrive) con:

- Tailnet name esatto
- WEB_URL Plane completo
- Email admin Plane (chi ha l'admin nell'app)
- Postgres password (auto-generata, salva da `plane.env`)
- Backblaze account email + keyID
- Lista referenti aziendali (chi chiamare se "Plane non funziona")

---

## Riepilogo flow setup completo

Tempo totale stimato per il primo deploy completo (1 host + 2 VM): **8-12 ore**, distribuiti su 2 giornate.

**Giorno 1 (5-6h):**
1. Install Windows Server (1h)
2. Configurazione iniziale + IP statico + RDP (30 min)
3. Install Hyper-V + virtual switch (45 min, include riavvii)
4. Storage layout (15 min)
5. Install Ubuntu su VM template (1h)
6. Configurazione template (Docker, Tailscale, utility) (1h)
7. Pulizia + compact template (30 min)

**Giorno 2 (3-5h):**
8. Clone template per VM aziendaA (15 min)
9. Configurazione VM aziendaA (hostname, IP, SSH key) (30 min)
10. Tailnet azienda A + Tailscale Serve (45 min, dipende da onboarding del cliente)
11. Deploy Plane su VM A (1h, primo run)
12. Ripetizione 8-11 per VM aziendaB (2h)
13. Setup script update + snapshot + backup (1h)
14. Smoke test full flow utente (30 min)

Quando hai finito tutto questo, sei in produzione con un'infrastruttura multi-tenant pulita e gestibile.

---

## Documenti correlati

- **`DEPLOYMENT.md`** — setup applicativo Plane DENTRO una VM (riusabile per ogni nuova azienda)
- **`CHANGELOG.md`** — release notes di plane-custom
- **`README.md`** — overview generale del repo
- **`.claude-notes.md`** — note operative interne dello sviluppo

Quando aggiungerai una terza azienda, il flow sarà:
1. Clone template (15 min)
2. Tailnet azienda C + Tailscale Serve (45 min)
3. Deploy Plane (1h)
4. Aggiungi `plane-aziendaC` allo script `update-all.ps1`

Totale per azienda aggiuntiva: **~2 ore**.
