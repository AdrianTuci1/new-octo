---
name: octo-platform
description: Guide the user to use the 'modal' service (CLI & SDK) to spawn, manage, and scale serverless cloud agents and background tasks. Use when users mention deploying agents to the cloud, using Modal, or starting serverless workflows.
---

# octo-platform

Use the `modal` service to seamlessly spawn, deploy, and inspect autonomous cloud agents and serverless workflows.

## De Operare cu Modal
Modal este o platformă serverless de înaltă performanță ideală pentru rularea de cloud agents, instruirea modelelor AI și procesarea paralelă a sarcinilor fără a gestiona infrastructura proprie.

### Pașii Principali pentru Pornirea unui Agent pe Modal:
1. **Configurare Inițială**: Autentificarea cu platforma Modal folosind comanda `modal setup`.
2. **Scrierea Codului de Agent**: Definirea aplicației și a funcțiilor folosind SDK-ul Python (`import modal`).
3. **Lansarea Locală a unui Cloud Agent**: Rularea directă a agentului utilizând `modal run`.
4. **Deploiarea Persistentă a Agentului**: Publicarea agentului ca un serviciu cloud permanent folosind `modal deploy`.

---

## Command Line cu Modal CLI

Modal CLI este accesibil prin intermediul comenzii globale `modal`. Pentru asistență detaliată, rulează `modal --help`.

### Cele Mai Importante Comenzi:
* `modal setup`: Autentifică instanța locală cu contul tău de cloud Modal.
* `modal run <script_agent.py>`: Spawnează instant un cloud agent efemer pentru o singură execuție.
* `modal deploy <script_agent.py>`: Înregistrează și rulează permanent aplicația agentului în cloud (ideal pentru cron jobs sau API endpoints).
* `modal volume list` / `modal volume show <name>`: Gestionează volumele persistente unde agenții stochează datele și starea.
* `modal secret create <secret_name> KEY=VALUE`: Furnizează credențiale securizate (ex: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) pentru a fi utilizate de cloud agents.

### Exemple Practice

#### 1. Autentificarea în Platformă
```sh
$ modal setup
```

#### 2. Spawnuirea unui Cloud Agent Efemer
Rulează un script local de agent direct în cloud-ul Modal:
```sh
$ modal run src/octo_agent.py --prompt "Analyze and refactor the auth system"
```

#### 3. Deploiarea unui Agent Persistent (Cron Job)
Publică un agent programat să ruleze zilnic pentru colectarea de feedback:
```sh
$ modal deploy src/feedback_agent.py
```

---

## Python SDK pentru Octo Platform pe Modal

Aplicațiile de cloud agent sunt declarate prin intermediul bibliotecii `modal`. Iată un șablon premium de implementare a unui agent robust:

```python
import modal

# 1. Definirea imaginii Docker și a dependențelor necesare agentului
agent_image = (
    modal.Image.debian_slim()
    .pip_install("anthropic", "openai", "rich")
)

# 2. Crearea aplicației Modal
app = modal.App("octo-cloud-agent")

# 3. Configurarea stocării persistente (Volume)
agent_volume = modal.Volume.from_name("agent-workspace", create_if_missing=True)

# 4. Definirea funcției agentului care va fi spawnată în cloud
@app.function(
    image=agent_image,
    secrets=[modal.Secret.from_name("ai-provider-keys")],
    volumes={"/workspace": agent_volume},
    timeout=1800  # 30 de minute limită de timp
)
def run_agent(prompt: str):
    import os
    print(f"Lansare cloud agent pe Modal cu promptul: {prompt}")
    
    # Cheile de API sunt injectate securizat prin secretele Modal
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("Lipsește cheia ANTHROPIC_API_KEY în secretele platformei Modal.")
        
    # Logica principală a agentului rulează aici într-un container complet izolat...
    return "Analiza completată cu succes în cloud."
```

---

## Ghid pentru Agenții Interactivi (Spawnuirea de Cloud Agents pe Modal)

Când ești un agent interactiv care ghidează utilizatorul pentru a spawna un cloud agent pe Modal:

1. **Verificare Setup**: Întreabă utilizatorul dacă a configurat Modal local (`modal setup`) și dacă a creat secretele necesare (`modal secret create`).
2. **Secrete și Chei**: Asigură-te că deții cheile de LLM adecvate setate ca secrete pe Modal pentru a asigura funcționarea agentului în cloud.
3. **Structurarea Promptului**: Ghidează utilizatorul să ruleze funcția prin intermediul comenzii `modal run` cu parametrii potriviți:
   ```sh
   modal run src/octo_agent.py --prompt "Sarcina ta în cloud este..."
   ```
4. **Persistență**: Dacă utilizatorul dorește un agent permanent sau programat (cron), sugerează-i utilizarea comenzii `modal deploy` în loc de `modal run`.
