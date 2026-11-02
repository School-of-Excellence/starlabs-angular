# Applies the 2 Nov 2026 update (delivery/queue forms, sponsor forms, submit checks, corrupted chain) to the
# WiSH and EI Solution manuals. Every replacement asserts its anchor exists exactly once.
import sys

def rep(s, old, new, label):
    n = s.count(old)
    assert n == 1, f"{label}: anchor found {n} times"
    return s.replace(old, new, 1)

def update(path, m):
    s = open(path, encoding='utf-8').read()

    # 1 · what's new, right after the "What is different" note
    s = rep(s, '<div class="note "><span class="tag">About the examples</span>',
        f'''<div class="note tip"><span class="tag">New in this update · 2 November 2026</span><ul>
<li>The <span class="ui">Forms</span> card has three parts: <span class="ui">Delivery activities</span>, <span class="ui">Queue activities</span> and <span class="ui">ATC forms</span> (<a href="#forms">Forms</a>).</li>
<li>A model can include an optional <b>sponsor</b> form; you pick the sponsor on the first send (<a href="#sponsor">Sponsor forms</a>).</li>
<li>A form you fill is saved under your own name, and the row says who filled each form.</li>
<li><a href="#submit-checks">What Submit checks</a> lists every rule, including the {m["name"]} extras.</li>
<li>If an ATC’s version history is ever broken, saving a form stops with “This ATC is corrupted — unable to find the stable version.”</li>
</ul></div>
<div class="note "><span class="tag">About the examples</span>''', 'whatsnew')

    # 2 · the model's example forms
    s = rep(s, m['forms_bullet_old'], m['forms_bullet_new'], 'forms bullet')

    # 3 · setup step 3: who fills (sponsor option, examples)
    s = rep(s, 'For each form choose who fills it: <span class="ui">Specialist</span> or <span class="ui">Participant</span>. Save stays disabled until every form has a choice.',
        'For each form choose who fills it: <span class="ui">Specialist</span>, <span class="ui">Participant</span> or <span class="ui">Sponsor</span> (a sponsor form is optional). Save stays disabled until every form has a choice. The forms in this manual are examples: add, remove or change who fills them whenever your process changes.',
        'setup who fills')

    # 4 · prescribe: the purchase is remembered
    s = rep(s, m['specialists_par_old'], m['specialists_par_old'] + f'''
<p>StarLabs also notes which <b>purchase</b> that appointment belongs to and keeps it on the ATC (in the draft too), so a participant who does {m["name"]} more than once gets the right delivery forms on each ATC.</p>''', 'purchase note')

    # 5 · prescribe: what Submit checks
    s = rep(s, '<p>Click <span class="btnlabel">Submit ATC</span>, read the confirmation and click <span class="btnlabel">Submit ATC</span> again.</p>',
        f'''<h3 id="submit-checks">What Submit checks</h3>
<p>The <span class="ui">Ready to submit</span> panel lists these and ticks each one green. If something is missing, Submit jumps to that field and says what it needs.</p>
<div class="table-wrap"><table><thead><tr><th>Check</th><th>Rule</th></tr></thead><tbody>
<tr><td>Participant, model and prescribed date</td><td>All three chosen</td></tr>
<tr><td>Author</td><td>At least one</td></tr>
<tr><td>{m["directive_label"]}</td><td>Not empty</td></tr>
{m["extra_rows"]}
<tr><td>First adjustment</td><td>Written, with its procedure picked</td></tr>
<tr><td>Every adjustment</td><td>Awareness and Potential Years set; no empty procedure rows</td></tr>
<tr><td>Consultation Points and Case Notes</td><td>Both filled</td></tr>
<tr><td>Changework brief</td><td>{m["brief_rule"]}</td></tr>
</tbody></table></div>
<p>Validation is your choice, not a check: pick <span class="ui">Validator Person(s)</span>, or tick <span class="ui">Make ATC visible to participant without any additional validation</span>. Offline, Submit waits: your draft is kept until you reconnect.</p>
<p>Click <span class="btnlabel">Submit ATC</span>, read the confirmation and click <span class="btnlabel">Submit ATC</span> again.</p>''', 'submit checks')

    # 6 · forms: the new card
    s = rep(s, m['forms_lede_old'],
        f'''<p class="lede">Open <span class="btnlabel">View Full ATC</span>. The <span class="ui">Forms</span> card collects every form that belongs to this ATC, in three parts:</p>
<div class="table-wrap"><table><thead><tr><th>Part</th><th>What it shows</th><th>When it shows</th></tr></thead><tbody>
<tr><td><span class="ui">Delivery activities</span></td><td>Forms the participant filled in this purchase’s delivery sequence, newest first, with the date and where they were filled</td><td>The ATC came from an appointment (it knows its purchase)</td></tr>
<tr><td><span class="ui">Queue activities</span></td><td>Forms the same participant filled in the queue the ATC was given in, with the stage</td><td>The ATC was given in a queue</td></tr>
<tr><td><span class="ui">ATC forms</span></td><td>The forms set on the {m["name"]} model, grouped: forms you fill, forms the participant fills, forms the sponsor fills (optional)</td><td>Once the ATC is validated; before that the part says “These open once the ATC is validated.”</td></tr>
</tbody></table></div>
<p>Each row says who filled it. If the same form shows twice, both stay visible so the cause can be traced. Forms are not part of Prescribe: the ATC is usually given in the first appointment and the forms are filled in later ones.</p>
<div class="note important"><span class="tag">Screenshots</span><p>The pictures in this section show the card before this update: it now has the three parts above, and “Filled by you” reads “Filled by” and your name.</p></div>''', 'forms lede')
    s = rep(s, '<td>Filled by you</td>', '<td>Filled by you — the row shows your name</td>', 'filled by you')
    s = rep(s, '<tr><td><span class="pill idle">Not required</span></td>',
        '<tr><td><span class="pill warn">Waiting for sponsor</span></td><td>Sent to the sponsor (optional sponsor forms)</td><td><span class="btnlabel">Withdraw</span></td></tr><tr><td><span class="pill idle">Not required</span></td>', 'sponsor status')

    # 7 · forms: sponsor subsection, after the forms section's last figure
    s = rep(s, m['forms_end_old'], m['forms_end_old'] + f'''
<h3 id="sponsor">Forms the sponsor fills (optional)</h3>
<p>Only when the {m["name"]} model includes a form filled by <span class="ui">Sponsor</span>. Sponsors are existing users of the app.</p>
<ol class="steps"><li><div>Click <span class="btnlabel">Send to sponsor</span>. The first time, search for the sponsor by name and pick them (“You can change the sponsor until the first sponsor form is sent.”), then <span class="btnlabel">Send to sponsor</span>.</div></li><li><div>The ATC keeps one sponsor. Once a sponsor form is sent or answered, the sponsor is locked: the group header shows a lock and the next send names the same person.</div></li><li><div>The sponsor sees the card under <span class="ui">Forms to fill</span> with a <span class="ui">Sponsor</span> tag and “For” the participant’s name. Statuses and buttons work as for participant forms.</div></li><li><div>To change the sponsor, withdraw every sponsor form that has no sponsor answer; the next send asks again.</div></li></ol>''', 'sponsor section')

    # 8 · edit: corrupted chain
    s = rep(s, m['edit_par_old'], m['edit_par_old'] + '''
<p>A form saved after an edit lands on the newest version. If the chain of versions is ever broken, saving stops with “This ATC is corrupted — unable to find the stable version.” Nothing is saved; tell your administrator.</p>''', 'edit corrupted')

    # 9 · app: sponsor card
    s = rep(s, m['app_par_old'], m['app_par_old'] + '''
<p>A sponsor gets the same <span class="ui">Forms to fill</span> list. A sponsor’s card carries a <span class="ui">Sponsor</span> tag and says who it is for.</p>''', 'app sponsor')

    # 10 · troubleshooting
    s = rep(s, m['faq_forms_old'], m['faq_forms_new'], 'faq forms card')
    s = rep(s, '</section>\n<footer>', '''<details><summary>A delivery form is missing from Delivery activities</summary><p>The ATC must know its purchase: that happens when it is prescribed from an appointment. Forms filled from the old journey screens, or before mid-May 2026, carry no purchase and are not listed.</p></details>
<details><summary>I can’t change the sponsor</summary><p>The sponsor locks once a sponsor form is sent or answered. Withdraw every sponsor form that has no sponsor answer, then send again and pick the new sponsor.</p></details>
<details><summary>“This ATC is corrupted — unable to find the stable version.”</summary><p>The ATC’s version history is broken. Nothing was saved. Tell your administrator with the participant’s name and the ATC.</p></details>
</section>
<footer>''', 'faq new')
    s = rep(s, m['footer_old'], m['footer_new'], 'footer')
    open(path, 'w', encoding='utf-8').write(s)
    print(path, 'updated')

WISH = dict(
    name='WiSH',
    forms_bullet_old='<li>Two forms come with the model: <span class="ui">WiSH Clarity Call</span> (the specialist fills it) and <span class="ui">WiSH Life Report</span> (the participant fills it in the app).</li>',
    forms_bullet_new='<li>In this manual the model has two example forms: <span class="ui">WiSH Clarity Call</span> (the specialist fills it) and <span class="ui">WiSH Life Report</span> (the participant fills it in the app). Forms are set per model and can change at any time; a sponsor form is optional.</li>',
    specialists_par_old='<p>As soon as you pick WiSH, StarLabs looks for the participant’s most recent WiSH Diagnostics appointment that you hosted and that was not cancelled. It reads who held each role and fills the Authors, Observers and change agent for you.</p>',
    directive_label='Immediate outcome',
    extra_rows='<tr><td>WiSH outcomes</td><td>At least one complete row (outcome area and outcomes expected); a half-filled row stops the submit</td></tr>',
    brief_rule='Always required for WiSH, because every WiSH procedure is mandatory (when an EIS, admin or AH prescribes)',
    forms_lede_old='<p class="lede">The forms on the WiSH model appear in a <span class="ui">Forms</span> card inside the full ATC once the ATC is validated and visible to the participant. Forms are not part of Prescribe: the ATC is usually given in the first appointment and the forms are filled in later ones.</p>',
    forms_end_old='<figure class=""><div class="shot"><img src="img/wish-view-forms-card-after.jpg" alt="The same card after the participant submitted from the app." loading="lazy"></div><figcaption><span class="src web">Web</span><span>The same card after the participant submitted from the app.</span></figcaption></figure>',
    edit_par_old='<p>Saving never overwrites: <span class="btnlabel">Review and update</span> shows a preview, and submitting it creates a new version. The previous version is kept and hidden from the participant, and forms already filled carry over. Procedures newly picked on a WiSH ATC are ticked Mandatory; saved procedures keep their setting.</p>',
    app_par_old='<p>Sent forms appear under <span class="ui">Forms to fill</span> on the home screen, with the model and the date it was sent. Tapping one opens <span class="ui">Fill Form</span>. The answers save as a draft while they type; <span class="ui">Preview</span> then <span class="ui">Confirm &amp; Submit</span> sends it, and the card disappears.</p>',
    faq_forms_old='<details><summary>There is no Forms card on the ATC</summary><p>The card appears only on validated ATCs that the participant can see, and only if the WiSH model has forms. Validate the ATC first, and check the Forms section of the model.</p></details>',
    faq_forms_new='<details><summary>There is no Forms card on the ATC</summary><p>The card shows when any of its three parts has something: delivery or queue answers, or the WiSH model’s forms. The ATC forms part opens once the ATC is validated; until then it says so. Check the Forms section of the model if no ATC forms appear.</p></details>',
    footer_old='<footer>StarLabs · WiSH ATC manual · Written for the release on the <code>atc-development</code> branch, 30 October 2026. Screenshots use fictional demo data on a test system.</footer>',
    footer_new='<footer>StarLabs · WiSH ATC manual · Written for the release on the <code>atc-development</code> branch, 30 October 2026; updated 2 November 2026 (delivery and queue forms, sponsor forms, submit checks). Screenshots use fictional demo data on a test system.</footer>',
)
EI = dict(
    name='EI Solution',
    forms_bullet_old='<li>One form comes with the model: <span class="ui">EI Solution Pre Form</span>, filled by the participant in the app.</li>',
    forms_bullet_new='<li>In this manual the model has one example form: <span class="ui">EI Solution Pre Form</span>, filled by the participant in the app. Forms are set per model and can change at any time; a sponsor form is optional.</li>',
    specialists_par_old='<p>As soon as you pick EI Solution, StarLabs looks for the participant’s most recent EI Solution Session appointment that you hosted and that was not cancelled. It reads who held each role and fills the Authors, Observers and change agent for you.</p>',
    directive_label='ATC directive',
    extra_rows='<tr><td>Ask · area of focus</td><td>At least one complete row (asked by and asked for); a half-filled row stops the submit</td></tr>',
    brief_rule='Required when any procedure is ticked Mandatory (when an EIS, admin or AH prescribes)',
    forms_lede_old='<p class="lede">The forms on the EI Solution model appear in a <span class="ui">Forms</span> card inside the full ATC once the ATC is validated and visible to the participant. Forms are not part of Prescribe: the ATC is usually given in the first appointment and the forms are filled in later ones.</p>',
    forms_end_old='<figure class=""><div class="shot"><img src="img/ei-view-forms-card-after.jpg" alt="After Ask to update: the form is waiting for the participant’s new answer." loading="lazy"></div><figcaption><span class="src web">Web</span><span>After Ask to update: the form is waiting for the participant’s new answer.</span></figcaption></figure>',
    edit_par_old='<p>Saving never overwrites: <span class="btnlabel">Review and update</span> shows a preview, and submitting it creates a new version. The previous version is kept and hidden from the participant, and forms already filled and the Review log carry over.</p>',
    app_par_old='<p>Sent forms appear under <span class="ui">Forms to fill</span> on the home screen, with the model and the date it was sent. Tapping one opens <span class="ui">Fill Form</span>. The answers save as a draft while they type; <span class="ui">Preview</span> then <span class="ui">Confirm &amp; Submit</span> sends it, and the card disappears.</p>',
    faq_forms_old='<details><summary>There is no Forms card on the ATC</summary><p>The card appears only on validated ATCs that the participant can see, and only if the EI Solution model has forms. Validate the ATC first, and check the Forms section of the model.</p></details>',
    faq_forms_new='<details><summary>There is no Forms card on the ATC</summary><p>The card shows when any of its three parts has something: delivery or queue answers, or the EI Solution model’s forms. The ATC forms part opens once the ATC is validated; until then it says so. Check the Forms section of the model if no ATC forms appear.</p></details>',
    footer_old='<footer>StarLabs · EI Solution ATC manual · Written for the release on the <code>atc-development</code> branch, 30 October 2026. Screenshots use fictional demo data on a test system.</footer>',
    footer_new='<footer>StarLabs · EI Solution ATC manual · Written for the release on the <code>atc-development</code> branch, 30 October 2026; updated 2 November 2026 (delivery and queue forms, sponsor forms, submit checks). Screenshots use fictional demo data on a test system.</footer>',
)

if __name__ == '__main__':
    base = sys.argv[1]
    update(f'{base}/wish-manual.html', WISH)
    update(f'{base}/ei-manual.html', EI)
