# Setup on Windows, with Proxmox VE in VirtualBox

This guide runs the portal on a Windows laptop and connects it to a real Proxmox VE server running in VirtualBox.
Do it in this order: run the portal in mock mode first (about 20 minutes), then add Proxmox (1 to 2 hours).
If something breaks later, you then know it is the Proxmox side and not the app.

- **Part 1** runs everything in Docker Desktop. No Terraform install is needed on Windows: the worker image already contains Terraform 1.9.8.
- **Part 2** creates a VirtualBox VM and installs Proxmox VE in it.
- **Part 3** creates the container template and API token, points `backend\.env` at Proxmox and runs a real request.

> **Hyper-V and nested virtualization.** Docker Desktop turns on Hyper-V. VirtualBox then runs on top of Hyper-V
> (a small green turtle icon) and the *Nested VT-x/AMD-V* option is greyed out. That is fine: the portal creates
> **LXC containers**, which do not need nested virtualization. Keep Docker Desktop and do not disable Hyper-V.

## Part 1: Run the portal (mock mode)

1. Check that virtualization is on: **Task Manager > Performance > CPU** should say *Virtualization: Enabled*.
   If not, turn on Intel VT-x or AMD-V (SVM) in the BIOS.
2. Install the tools from PowerShell, then restart Windows once:
   ```powershell
   winget install Git.Git
   winget install Docker.DockerDesktop
   winget install Oracle.VirtualBox
   ```
   Node 20+ and Terraform are only needed to run the apps with npm instead of Docker
   (`winget install OpenJS.NodeJS.LTS`, `winget install Hashicorp.Terraform`).
3. Start Docker Desktop and wait for *Engine running*. Keep the default WSL 2 backend.
4. Clone and start the portal:
   ```powershell
   git clone https://github.com/Muthujar/infra-portal.git
   cd infra-portal
   copy backend\.env.example backend\.env
   docker compose up --build
   ```
   The first build takes 5 to 10 minutes.
5. Open http://localhost:8080, click the **dev@demo.local** button, request a server, log in as **lead@demo.local**,
   approve it and watch it reach *Ready*.

Only port 8080 is opened on your machine. If it is already in use, stop that program or change the left port number
of the `web` service in `docker-compose.yml`.

## Part 2: Install Proxmox VE in VirtualBox

1. Download the latest **Proxmox VE ISO Installer** from https://www.proxmox.com/en/downloads.
2. In VirtualBox click **New**:

   | Setting | Value |
   |---|---|
   | Name | proxmox |
   | ISO image | the Proxmox ISO; tick *Skip Unattended Installation* |
   | Type / Version | Linux / Debian (64-bit) |
   | Memory | 8192 MB |
   | Processors | 4 |
   | Hard disk | 64 GB, VDI, dynamically allocated |
   | System > Processor | tick *Enable Nested VT-x/AMD-V* if it is not greyed out (greyed out is OK) |
   | Network > Adapter 1 | **Bridged Adapter**, on the adapter you use for internet (Wi-Fi or Ethernet) |
   | Network > Adapter 1 > Advanced | Promiscuous Mode: **Allow All** (so containers inside Proxmox get their own IPs) |

3. Start the VM and choose **Install Proxmox VE (Graphical)**. If the screen is garbled, restart and pick **Terminal UI**.
4. In the installer:
   - Target disk: keep the default (ext4). This creates the `local-lvm` storage the portal uses.
   - Choose a root password and email.
   - Network: hostname `pve.lab.local`. Write down the **IP, gateway and DNS**. Ideally pick an IP your router is
     unlikely to hand out (for example `.200`).
5. After the reboot, open `https://<ip>:8006` in your Windows browser, accept the certificate warning and log in as
   `root` with realm *Linux PAM*. The "No valid subscription" popup is normal for the free version.

The node name in the left tree (under *Datacenter*) is `pve`. That is your `PROXMOX_NODE`.

## Part 3: Connect the portal to Proxmox

1. **Download a container template.** *pve > local (pve) > CT Templates > Templates*, pick **ubuntu-22.04-standard**,
   click Download. Copy the exact file name (for example `ubuntu-22.04-standard_22.04-1_amd64.tar.zst`).
2. **Create an API token.** *Datacenter > Permissions > API Tokens > Add*: user `root@pam`, token ID `portal`,
   **untick Privilege Separation**. Copy the secret now; Proxmox shows it only once.
3. **Test the token** from PowerShell. It should print JSON containing `"node":"pve"`:
   ```powershell
   curl.exe -k -H "Authorization: PVEAPIToken=root@pam!portal=YOUR-SECRET" https://192.168.1.200:8006/api2/json/nodes
   ```
4. **Edit `backend\.env`:**
   ```
   PROVISIONER=local
   PROXMOX_ENDPOINT=https://192.168.1.200:8006/
   PROXMOX_API_TOKEN=root@pam!portal=YOUR-SECRET
   PROXMOX_NODE=pve
   PROXMOX_DATASTORE=local-lvm
   PROXMOX_LXC_TEMPLATE=local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst
   PROXMOX_BRIDGE=vmbr0
   ```
   Leave `TERRAFORM_BIN=terraform`; it points to the Terraform inside the worker image.
5. **Restart the API and worker** so they read the new settings:
   ```powershell
   docker compose up -d --force-recreate api worker
   ```
6. **Run a real request.** Log in as dev, request a small Proxmox server in DEV, approve it as lead. The provisioning
   log on the request page shows `terraform init` and `terraform apply`. The container appears in Proxmox (usually CT 100).
7. **Clean up.** Click *Decommission*. Terraform destroys the container and it disappears from Proxmox.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser cannot open `https://<ip>:8006` | Bridged to the wrong adapter, or you joined a different Wi-Fi after installing. Some office or hotel Wi-Fi blocks bridged VMs; use home Wi-Fi or a phone hotspot, or switch to Host-only (last row). |
| Token test returns 401 | The token must be `root@pam!portal=<secret>` with no spaces, and Privilege Separation must be off. |
| `terraform init` fails | The worker needs internet access to registry.terraform.io. Check VPN or proxy settings. |
| Apply error mentions template or `vztmpl` | `PROXMOX_LXC_TEMPLATE` does not match the downloaded file name exactly. |
| Apply error mentions node or storage | `PROXMOX_NODE` must match the tree name. `local-lvm` exists only with ext4 in the installer (with ZFS it is `local-zfs`). |
| Container is created but has no IP | Promiscuous Mode is not *Allow All*, or the Wi-Fi router refuses the extra MAC address. Creation still succeeds. |
| VirtualBox shows a green turtle and feels slow | Normal while Docker Desktop runs (Hyper-V). LXC containers still work. |
| Laptop runs out of memory | Proxmox uses 8 GB. Cap Docker's WSL with a `%UserProfile%\.wslconfig` containing `[wsl2]` and `memory=6GB`, then run `wsl --shutdown`. |
| Bridged networking does not work at all | Set Adapter 1 to **Host-only** (laptop reaches Proxmox on 192.168.56.x) and add Adapter 2 as **NAT** for internet. Proxmox's IP is fixed at install time, so reinstalling is the simplest way to switch. |
