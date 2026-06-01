pub(super) const MAX_STAGE_PASSES: u32 = 150;

pub(super) fn tool_selection_stage_instructions(pass_index: u32) -> Vec<String> {
    let mut instructions = vec![
        "Alege exact următoarea acțiune utilă. Dacă poți răspunde direct, răspunde direct. Dacă ai nevoie de un tool, emite exact un tool call valid și nu amesteca pseudo-markup în textul vizibil.".to_string(),
        "Dacă utilizatorul cere explicit un plan vizibil sau task-ul cere structurare înainte de execuție, poți folosi direct `propose_plan`, `update_plan` sau `plan_execution`, apoi continui cu următorul pas util.".to_string(),
        "Dacă vrei să propui o comandă de terminal, numele exact al tool-ului este `propose_terminal_command` și argumentele trebuie să includă un câmp `command` concret. Nu inventa aliasuri precum `shell:execute` sau alte variante similare. Nu emite niciodată acest tool fără `command`; un tool call cu args goale este invalid. Dacă nu poți formula comanda acum, răspunde direct sau cere o clarificare scurtă.".to_string(),
        "Pentru task-uri mici și explicite de editare locală, dacă fișierul sau zona țintă este deja evidentă din contextul workspace-ului, preferă direct `propose_file_change` în loc să consumi pași cu listări sau citiri redundante.".to_string(),
        "Dacă task-ul cere să creezi sau să populezi fișiere de proiect, nu irosi un pas pe comenzi de pregătire precum `mkdir`, `touch`, `cat > file` sau alte shell helpers atunci când poți crea direct fișierele finale prin `propose_file_change`. Folosește terminalul pentru verificare sau inspecție, nu ca substitut pentru editarea structurată a fișierelor.".to_string(),
    ];

    if pass_index > 0 {
        instructions.push(
            "Acesta este un retry. Nu repeta aceeași alegere ineficientă; alege următorul pas minim care avansează clar task-ul."
                .to_string(),
        );
    }

    instructions
}
