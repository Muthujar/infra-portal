# Set up real Proxmox on Windows

Run the portal against Proxmox VE in VirtualBox. This takes 1 to 2 hours.

**Before you start:** get the portal running with the [quick start](../README.md#quick-start). You need 16 GB+ RAM, virtualization enabled in the BIOS, and about 64 GB of free disk.

Keep Docker Desktop on. VirtualBox runs alongside it, and the portal's LXC containers do not need nested virtualization.

## 1. Install Proxmox in VirtualBox

1. Install VirtualBox: `winget install Oracle.VirtualBox`
2. Download the **Proxmox VE ISO** from https://www.proxmox.com/en/downloads
3. Create a VM with these settings:

   | Setting | Value |
   |---|---|
   | Type | Linux, Debian (64-bit) |
   | Memory, CPUs, disk | 8192 MB, 4, 64 GB dynamic |
   | Network | **Bridged Adapter** on your Wi-Fi or Ethernet |
   | Promiscuous Mode | **Allow All** |

4. Start the VM and choose **Install Proxmox VE (Graphical)**.
5. Keep the default **ext4** disk option, which creates the `local-lvm` storage.
6. Set the hostname to `pve.lab.local`, and choose a free IP on your network. Note the IP.
7. After the reboot, remove the ISO from the VM's optical drive if the installer starts again.
8. Open `https://<ip>:8006` and log in as `root` with realm **Linux PAM**.

## 2. Prepare Proxmox

1. **Template:** go to *pve > local (pve) > CT Templates > Templates*, choose **ubuntu-22.04-standard**, and click Download.
2. **Token:** go to *Datacenter > Permissions > API Tokens > Add*. Use user `root@pam` and token ID `portal`, and **untick Privilege Separation**. Copy the secret.

## 3. Connect the portal

Edit `backend\.env`:

```
PROVISIONER=local
PROXMOX_ENDPOINT=https://<ip>:8006/
PROXMOX_API_TOKEN=root@pam!portal=YOUR-SECRET
PROXMOX_NODE=pve
PROXMOX_DATASTORE=local-lvm
PROXMOX_LXC_TEMPLATE=local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst
PROXMOX_BRIDGE=vmbr0
```

Restart the portal and check the settings:

```powershell
docker compose up -d --force-recreate api worker
docker compose run --rm api npx tsx scripts/check-setup.ts
```

Every line should say `OK`. Terraform is already included in the worker image.

## 4. Run a real request

Request a small Proxmox server in DEV and approve it. The container appears in Proxmox, usually as CT 100. Click **Decommission** to delete it.

## Troubleshooting

| Problem | Fix |
|---|---|
| `https://<ip>:8006` will not open | Check the bridged adapter. Some Wi-Fi networks block bridged VMs |
| Token returns 401 | Use `root@pam!portal=<secret>` with no spaces, and Privilege Separation off |
| Template download fails | Download the file on Windows, then use **Upload** on the same Proxmox page |
| Error mentions template or storage | Names must match Proxmox exactly. The setup check shows what to fix |
| Container has no IP | Set Promiscuous Mode to Allow All |
| Docker Desktop will not start, with a `dockerInference` error | Quit it, delete the `dockerInference` file from `%LOCALAPPDATA%\Docker\run`, and start it again. Do not factory reset |
