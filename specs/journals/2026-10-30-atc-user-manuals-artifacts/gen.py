# Builds site/wish-atc-manual.html and site/ei-solution-atc-manual.html from shared sections.
import os
S = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(S, 'site')
IMG = os.path.join(SITE, 'img')
USED = {'wish': set(), 'ei': set()}
CUR = ['wish']


def img(name):
    path = os.path.join(IMG, name)
    if not os.path.exists(path):
        return None
    USED[CUR[0]].add(name)
    return f'img/{name}'


def fig(name, caption, cls='', src='web'):
    p = img(name if name.endswith('.jpg') else name + '.jpg')
    if not p:
        return f'<!-- missing {name} -->'
    tag = 'Web' if src == 'web' else 'App'
    return (f'<figure class="{cls}"><div class="shot"><img src="{p}" alt="{caption}" loading="lazy"></div>'
            f'<figcaption><span class="src {src}">{tag}</span><span>{caption}</span></figcaption></figure>')


def pair(a, b):
    return f'<div class="pair">{a}{b}</div>'


def phones(items):
    out = []
    for name, cap in items:
        p = img(f'm-{name}.jpg')
        if p:
            out.append(f'<figure><div class="shot"><img src="{p}" alt="{cap}" loading="lazy"></div>'
                       f'<figcaption><span class="src app">App</span> {cap}</figcaption></figure>')
    return f'<div class="phones">{"".join(out)}</div>' if out else '<!-- no phone shots -->'


def note(kind, tag, body):
    return f'<div class="note {kind}"><span class="tag">{tag}</span>{body}</div>'


def ui(t):
    return f'<span class="ui">{t}</span>'


def b(t):
    return f'<span class="btnlabel">{t}</span>'


# ---------------------------------------------------------------------------------------------------------
def page(key):
    CUR[0] = key
    W = key == 'wish'
    name = 'WiSH' if W else 'EI Solution'
    other = ('https://claude.ai/artifact/Rw5tp9SQ5Zag8qUfNeqQWt', 'EI Solution ATC manual') if W else ('https://claude.ai/artifact/2Z79mXkJJSL2imAuSvJXnW', 'WiSH ATC manual')
    spec_form = 'WiSH Clarity Call' if W else None
    part_form = 'WiSH Life Report' if W else 'EI Solution Pre Form'
    participant = 'Asha Menon' if W else 'Rahul Verma'
    new_p = 'Neha Kapoor' if W else 'Arjun Pillai'
    collab = 'Rohan Das' if W else 'Vikram Nair'
    appt = 'WiSH Diagnostics' if W else 'EI Solution Session'
    role_spec = 'WiSH Diagnostics Specialist' if W else 'EI Diagnostics Specialist'
    role_coll = 'WiSH Diagnostics Collaborator' if W else 'EI Shadow'
    pre = 'wish' if W else 'ei'
    P = []
    add = P.append

    toc = [('overview', 'How it works'), ('setup', 'One-time setup'), ('prescribe', f'Prescribe a {name} ATC'),
           ('follow', 'Follow up in View ATC'), ('forms', 'Forms')]
    if not W:
        toc.append(('review', 'Review log'))
    toc += [('edit', 'Edit an ATC'), ('app', 'What the participant sees'), ('faq', 'Troubleshooting')]

    # ---- head + hero
    add(f'''<title>{name} ATC Manual</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=JetBrains+Mono:wght@400;500;600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap">
<link rel="stylesheet" href="manual.css">
<div class="page {'theme-wish' if W else 'theme-ei'}">
<nav class="toc" aria-label="Contents"><div class="eyebrow">Contents</div><ol>''')
    for i, t in toc:
        add(f'<li><a href="#{i}">{t}</a></li>')
    add(f'</ol><div class="other">Also available: <a href="{other[0]}">{other[1]}</a></div></nav><main>')
    add(f'''<header class="hero"><img src="{img('model-' + pre + '.jpg')}" alt="">
<div><div class="eyebrow">StarLabs · User manual</div><h1>{name} ATC</h1>
<p>How a {name} ATC moves from the appointment to the participant's phone, and how administrators set it up.
Screens are from the StarLabs web app and the Breakthroughs participant app.</p>
<div class="chips"><span class="chip">Administrators: setup</span><span class="chip">Specialists: prescribe and follow up</span><span class="chip">Participants: the app</span></div></div></header>''')

    # ---- 1 overview
    add(f'<section id="overview"><h2><span class="num">01</span>How a {name} ATC works</h2>')
    add(f'<p class="lede">An ATC is the plan a specialist prescribes after a diagnostics appointment: a directive, the adjustments the participant will make, and the procedures (change work) for each adjustment. {name} is one ATC model. It uses the same ATC screens as every other model, with a few extra sections switched on.</p>')
    add('<ol class="flow">'
        '<li><b>Set up once</b><span>Forms, activities, the ATC model and the appointment mapping.</span><span class="who">Administrator</span></li>'
        f'<li><b>Appointment</b><span>The participant has a {appt} appointment with two specialists.</span><span class="who">Specialists</span></li>'
        '<li><b>Prescribe</b><span>The specialist writes the ATC. The appointment fills in who did what.</span><span class="who">Specialist</span></li>'
        '<li><b>Validate</b><span>A validator approves it, or it goes straight to the participant.</span><span class="who">Mentor</span></li>'
        '<li><b>Follow up</b><span>Forms are filled and sent, the ATC is edited if needed. The participant sees it in the app.</span><span class="who">Specialist · Participant</span></li>'
        '</ol>')
    if W:
        add(note('diff', 'What is different about WiSH', '<ul>'
                 '<li>The directive is called <span class="ui">Immediate outcome expected from WiSH</span>.</li>'
                 '<li>A <span class="ui">WiSH outcomes</span> table lists each outcome area and the outcome expected. At least one row is required.</li>'
                 '<li>Every procedure you pick is ticked <span class="ui">Mandatory</span> automatically, so a Changework brief is always needed.</li>'
                 '<li><span class="ui">Directives for Micro ATC</span> is hidden.</li>'
                 '<li>Two forms come with the model: <span class="ui">WiSH Clarity Call</span> (the specialist fills it) and <span class="ui">WiSH Life Report</span> (the participant fills it in the app).</li></ul>'))
    else:
        add(note('diff', 'What is different about EI Solution', '<ul>'
                 '<li>An <span class="ui">Ask · area of focus</span> list records who asked for the change (Self, Spouse, Family, Friends or Sponsors) and what they asked for. At least one complete row is required.</li>'
                 '<li>A <span class="ui">Review log</span> holds internal notes after each follow-up. It is never shown in the participant app.</li>'
                 '<li><span class="ui">Directives for Micro ATC</span> is hidden.</li>'
                 '<li>Procedures work as in a regular ATC: you choose which are mandatory and who the change agent is for each one.</li>'
                 '<li>One form comes with the model: <span class="ui">EI Solution Pre Form</span>, filled by the participant in the app.</li></ul>'))
    add(note('', 'About the examples', f'<p>Every screenshot uses made-up demo people on a test system: {participant}, {new_p} and others are participants; Kavya Rao is the specialist, {collab} the collaborator and Sanjay Kulkarni the validator.</p>'))
    add('</section>')

    # ---- 2 setup
    add('<section id="setup"><h2><span class="num">02</span>One-time setup</h2>')
    add(f'<p class="lede">An administrator does this once. After that, specialists only use Prescribe ATC and View Prescribed ATC. Do the steps in this order, because each one uses what the previous one created.</p>')
    add('<div class="table-wrap"><table><thead><tr><th>Step</th><th>Screen</th><th>What you set</th></tr></thead><tbody>'
        f'<tr><td>1</td><td>Delivery Activities <code>/deliveryactivities</code></td><td>The form{"s" if W else ""} ({", ".join(x for x in [spec_form, part_form] if x)})</td></tr>'
        '<tr><td>2</td><td>BIG Activity <code>/bigactivity</code></td><td>Which ATC role each activity fills (author, observer, mentoring, change agent)</td></tr>'
        f'<tr><td>3</td><td>ATC Model <code>/atcmodel</code></td><td>The model named exactly <code>{name}</code>, its directive, image and forms</td></tr>'
        f'<tr><td>4</td><td>Map Appointment Role <code>/mapappointmentrole</code></td><td>That an ATC is given in {appt} appointments, and which activities each role fills</td></tr>'
        '</tbody></table></div>')

    add('<h3>Step 1 · Create the forms</h3>')
    add(f'<p>Open {ui("Delivery Activities")}, click {b("Add Delivery Activities")}, choose the type {ui("Form")} and build the questions with the form builder. The form name you type here is the name specialists and participants see.</p>')
    add(fig('cfg-delivery-forms', f'Delivery Activities filtered by name. Forms show the type “Form”.', 'mid'))
    add(fig('cfg-delivery-form-dialog', f'Editing the {part_form}. Every question type of the form builder works in ATC forms.', 'narrow'))
    add(note('tip', 'Retiring a form', f'<p>Use {b("Delete form")} to retire a form. It is hidden from new setups but kept for answers already given, and the list shows it as “(Deleted)”. {b("Restore form")} brings it back.</p>'))

    add('<h3>Step 2 · Tell StarLabs what each activity means in an ATC</h3>')
    add(f'<p>Open {ui("BIG Activity")}. Each activity has an {ui("ATC Property")}. Prescribe ATC uses it to put the appointment’s specialists in the right place:</p>')
    add('<div class="table-wrap"><table><thead><tr><th>ATC Property</th><th>Where it lands in the ATC</th><th>Demo activity</th></tr></thead><tbody>'
        '<tr><td><code>author</code></td><td>Authors (Diagnostics Solo)</td><td>Diagnostics Solo</td></tr>'
        '<tr><td><code>observer</code></td><td>Observers (Diagnostics Shadow)</td><td>Diagnostics Shadow</td></tr>'
        '<tr><td><code>mentoring</code></td><td>Mentors</td><td>Mentoring</td></tr>'
        '<tr><td><code>assigned_to</code></td><td>The change agent on each procedure</td><td>Changework Solo</td></tr>'
        '</tbody></table></div>')
    add(pair(fig('cfg-bigactivity', 'The activities and their ATC Property.'),
             fig('cfg-bigactivity-dialog', 'Setting the ATC Property on an activity.')))

    add(f'<h3>Step 3 · Create the {name} ATC model</h3>')
    add(f'<p>Open {ui("ATC Model")} and click {b("Create ATC Model")}, or the pencil on an existing row.</p>')
    add('<ol class="steps">'
        f'<li><div>Name it exactly <code>{name}</code>. Upper and lower case do not matter, but the spelling and the space{" " if not W else ""} must match. This name is what switches on the {name} sections in every ATC screen.</div></li>'
        '<li><div>Pick the <span class="ui">Evolution type</span> (required). Category, description and content videos are optional.</div></li>'
        f'<li><div>Write the <span class="ui">ATC directive</span>. It pre-fills the {"immediate outcome" if W else "directive"} on every new {name} ATC, and the specialist can change it.</div></li>'
        '<li><div>Upload an image: square (1:1), PNG, JPG or WebP, 200 KB or less. It appears next to the ATC in the participant app.</div></li>'
        f'<li><div>Under <span class="ui">Forms</span>, use <span class="ui">Add a form</span> to add {"both forms" if W else "the Pre Form"}. For each form choose who fills it: <span class="ui">Specialist</span> or <span class="ui">Participant</span>. Save stays disabled until every form has a choice.</div></li>'
        '</ol>')
    add(pair(fig(f'cfg-atcmodel-dialog-{pre}', f'The {name} model, with its image and forms.'),
             fig('cfg-atcmodel-list', 'The ATC Model list shows each model’s forms.')))
    add(note('important', 'One model, one name', f'<p>Keep a single model called {name}. The appointment mapping in step 4 matches the model by its exact name, so a copy such as “{name} 2” or a different spelling will not fill in the specialists.</p>'))

    add(f'<h3>Step 4 · Map the {appt} appointment</h3>')
    add(f'<p>Open {ui("Map Appointment Role")} and edit the row for the appointment type (or add one). This is what lets Prescribe ATC fill in the specialists for you.</p>')
    add('<ol class="steps">'
        f'<li><div>Choose the <span class="ui">Appointment Type</span> ({appt}) and its <span class="ui">Required Role</span>s ({role_spec} and {role_coll}).</div></li>'
        '<li><div>Tick <span class="ui">An ATC is given in this appointment</span>.</div></li>'
        f'<li><div>Choose the <span class="ui">ATC model</span>: {name}.</div></li>'
        f'<li><div>Under <span class="ui">ATC activities</span>, pick the activities each role fills. In the demo, {role_spec} fills Diagnostics Solo (author), and {role_coll} fills Diagnostics Shadow (observer) and Changework Solo (change agent). A role can fill more than one activity; every required role needs at least one.</div></li>'
        f'<li><div>Click {b("Update Role")}.</div></li></ol>')
    add(pair(fig(f'cfg-maprole-dialog-{pre}', f'The {appt} mapping with the ATC card filled in.'),
             fig('cfg-maprole-list', 'The mapping list.')))
    add('</section>')

    # ---- 3 prescribe
    add(f'<section id="prescribe"><h2><span class="num">03</span>Prescribe a {name} ATC</h2>')
    add(f'<p class="lede">Open {ui("Prescribe ATC")} after the appointment. The screen saves a draft as you type, so you can leave and come back. The panel on the right shows what is still missing.</p>')
    add('<h3>Choose the participant and the model</h3>')
    add('<ol class="steps">'
        f'<li><div>Pick the <span class="ui">Participant</span>. If they already have a draft, you can continue it or click <span class="ui">Start fresh</span>.</div></li>'
        f'<li><div>In <span class="ui">ATC given for</span>, pick <span class="ui">{name}</span>. Both fields lock once chosen, so check them before you move on.</div></li>'
        '<li><div>Check the <span class="ui">Prescribed date</span>.</div></li></ol>')
    add(fig(f'{pre}-prescribe-top', f'{new_p} with {name} picked. The {"immediate outcome" if W else "directive"} is already filled from the ATC model.'))

    add('<h3>Specialists are filled in from the appointment</h3>')
    add(f'<p>As soon as you pick {name}, StarLabs looks for the participant’s most recent {appt} appointment that you hosted and that was not cancelled. It reads who held each role and fills the Authors, Observers and change agent for you.</p>')
    add(fig(f'{pre}-prescribe-specialists', f'Kavya Rao (author) and {collab} (observer) came from the appointment.'))
    add(note('important', 'When nothing is filled in', f'<p>The screen does not show a message. The specialists stay empty if you were not a host of the appointment, if the appointment has not started yet or was cancelled, or if the {appt} mapping (setup step 4) is missing or points to a different model name. Pick the specialists by hand and tell your administrator.</p>'))

    if W:
        add('<h3>Immediate outcome and WiSH outcomes</h3>')
        add(f'<p>The directive appears as <span class="ui">Immediate outcome expected from WiSH</span>. Use {b("Edit Immediate Outcome")} to write it in the participant’s own life situation.</p>')
        add('<p>The <span class="ui">WiSH outcomes</span> table opens with five empty rows. Fill an <span class="ui">Outcome area</span> and the <span class="ui">Outcomes expected</span> for each area that matters. Use <span class="ui">+ Add outcome area</span> for more rows and the red cross to remove one. Empty rows are dropped when you submit; a half-filled row stops the submit.</p>')
        add(fig('wish-prescribe-outcomes', 'Two outcome areas filled; the counter shows “2 filled”.'))
    else:
        add('<h3>Directive and Ask · area of focus</h3>')
        add(f'<p>Write the <span class="ui">ATC directive</span> with {b("Edit Directive")} (it starts with the model’s text). Then fill <span class="ui">Ask · area of focus</span>: for each ask choose <span class="ui">Asked by</span> (Self, Spouse, Family, Friends or Sponsors) and type what was <span class="ui">Asked for</span>. Use {b("+ Add New Ask")} for more rows.</p>')
        add(fig('ei-prescribe-ask', 'Two complete asks. A half-filled row stops the submit; at least one complete row is required.'))

    add('<h3>Adjustments and procedures</h3>')
    if W:
        add(f'<p>For each adjustment, write what changes. To record the outcome of that adjustment, add it on a new line starting with <code>Outcome -</code>, as in the example. Pick the procedure for each adjustment; every WiSH procedure is ticked {ui("Mandatory")} as you pick it. Awareness and Potential Years are still required for each adjustment.</p>')
        add(f'<p>The blue <span class="ui">Changework Solo — set for all procedures</span> box shows the change agent from the appointment. {b("Apply to all procedures")} copies it to every procedure, and new procedures pick it up too. You can still change the change agent on a single procedure.</p>')
    else:
        add(f'<p>For each adjustment, write what changes, set Awareness and Potential Years, and pick the procedures. For each procedure choose {ui("Recommended To")}, the change agent, and whether it is {ui("Mandatory")}.</p>')
        add(f'<p>The <span class="ui">Changework Solo — set for all procedures</span> box shows the change agent from the appointment. {b("Apply to all procedures")} copies it to every procedure; you can still change it on any single procedure.</p>')
    add(fig(f'{pre}-prescribe-adjustment', 'An adjustment with its first procedure.' + (' Mandatory is already ticked.' if W else '')))

    add('<h3>Notes, Changework brief and validation</h3>')
    cw = ui('Changework brief')
    add(f'<p>Fill <span class="ui">Consultation Points</span> and <span class="ui">Case Notes</span> (both required). ' + (f'Because every WiSH procedure is mandatory, a {cw} (recorded or uploaded audio) is always required.' if W else f'A {cw} (recorded or uploaded audio) is required when any procedure is mandatory.') + '</p>')
    add(f'<p>Under <span class="ui">Validation</span>, either pick the <span class="ui">Validator Person(s)</span>, or tick <span class="ui">Make ATC visible to participant without any additional validation</span> to send it straight to the participant.</p>')
    add(pair(fig(f'{pre}-prescribe-validation', 'Changework brief, images and validation.'),
             fig(f'{pre}-prescribe-panel', f'“Ready to submit” turns green item by item.')))
    add(f'<p>Click {b("Submit ATC")}, read the confirmation and click {b("Submit ATC")} again.</p>')
    add(fig(f'{pre}-prescribe-confirm', 'The final confirmation.', 'narrow'))
    add('</section>')

    # ---- 4 follow up
    add('<section id="follow"><h2><span class="num">04</span>Follow up in View Prescribed ATC</h2>')
    add(f'<p class="lede">{ui("View Prescribed ATC")} lists every ATC you can see. Specialists see the ATCs they authored; admins, mentors and AH see all of them. Filter by author, ATC model, participant, queue, mentor or date.</p>')
    add(fig('view-list', 'The list. Each card shows the model tag, the validation status and, for models with forms, how many forms are submitted.'))
    add(fig(f'{pre}-view-collapsed', 'A closed card.' + (' WiSH shows “Immediate outcome” instead of “ATC Directive”.' if W else ' EI Solution shows the number of reviews.')))
    add(f'<p>Use {b("Mark ATC as Validated")} to validate an ATC that is waiting, {b("Edit ATC")} to change it, and {b("View Full ATC")} to open everything on one page: the Forms card, the {"WiSH outcomes" if W else "Ask list and Review log"}, the adjustments and the notes.</p>')
    add(fig(f'{pre}-view-template-card', f'{"WiSH outcomes" if W else "Ask · area of focus"} inside the full ATC.', 'mid'))
    add('</section>')

    # ---- 5 forms
    add('<section id="forms"><h2><span class="num">05</span>Forms</h2>')
    add(f'<p class="lede">The forms on the {name} model appear in a <span class="ui">Forms</span> card inside the full ATC once the ATC is validated and visible to the participant. Forms are not part of Prescribe: the ATC is usually given in the first appointment and the forms are filled in later ones.</p>')
    add(fig(f'{pre}-view-forms-card', 'The Forms card: a summary line, then one group for the forms you fill and one for the forms the participant fills in the app.'))
    add('<div class="table-wrap"><table><thead><tr><th>Status</th><th>What it means</th><th>Buttons</th></tr></thead><tbody>'
        f'<tr><td><span class="pill idle">To fill</span></td><td>A specialist form nobody has filled yet</td><td>{b("Fill form")}</td></tr>'
        f'<tr><td><span class="pill ok">Submitted</span></td><td>Filled by you</td><td>{b("View answer")} {b("Edit answer")}</td></tr>'
        f'<tr><td><span class="pill idle">Not sent</span></td><td>The participant can’t see this form yet</td><td>{b("Send to participant")}</td></tr>'
        f'<tr><td><span class="pill warn">Waiting for participant</span></td><td>Sent; it is on the participant’s home screen</td><td>{b("Withdraw")}</td></tr>'
        f'<tr><td><span class="pill warn">Waiting for update</span></td><td>Sent back so the participant can change their answer</td><td>{b("View answer")} {b("Withdraw")}</td></tr>'
        f'<tr><td><span class="pill ok">Submitted</span></td><td>Filled by the participant</td><td>{b("View answer")} {b("Ask to update")}</td></tr>'
        '<tr><td><span class="pill idle">Not required</span></td><td>The form was deleted in Delivery Activities</td><td>none</td></tr>'
        '</tbody></table></div>')
    if W:
        add('<h3>Forms you fill (WiSH Clarity Call)</h3>')
        add(f'<p>{b("Fill form")} opens the form in a new tab. Answer the questions and click {ui("Preview &amp; Submit")}; the tab closes and the card updates by itself. {b("Edit answer")} opens the same answer for changes ({ui("Preview &amp; Update")}). If the ATC was edited while the form was open, the answer is saved on the newest version.</p>')
        add(pair(fig('wish-view-answer', 'View answer shows the submitted form, read-only.'),
                 fig('wish-form-edit-screen', 'Edit answer opens the form with the saved answers.')))
    add(f'<h3>Forms the participant fills ({part_form})</h3>')
    add('<ol class="steps">'
        f'<li><div>Click {b("Send to participant")}. The form appears under <span class="ui">Forms to fill</span> on the participant’s home screen in the app.</div></li>'
        f'<li><div>While it waits, {b("Withdraw")} takes it back (you are asked to confirm). The participant can no longer submit it.</div></li>'
        f'<li><div>When the participant submits, the row turns <span class="pill ok">Submitted</span>. {b("View answer")} shows what they wrote.</div></li>'
        f'<li><div>{b("Ask to update")} sends it back with their answer filled in, so they can change it. The row shows <span class="pill warn">Waiting for update</span> until they submit again.</div></li></ol>')
    if not W:
        add(fig('ei-view-answer', 'View answer on the participant’s EI Solution Pre Form.', 'mid'))
    after = img(f'{pre}-view-forms-card-after.jpg')
    if after:
        add(fig(f'{pre}-view-forms-card-after', 'The same card after the participant submitted from the app.' if W else 'After Ask to update: the form is waiting for the participant’s new answer.'))
    add('</section>')

    # ---- review log (EI)
    if not W:
        add('<section id="review"><h2><span class="num">06</span>Review log</h2>')
        add('<p class="lede">After each follow-up, write a short internal note in the <span class="ui">Review log</span> inside the full ATC. The log is tagged “Hidden in the participant app”: participants never see it.</p>')
        add('<ol class="steps">'
            f'<li><div>Type the note and click {b("Add review")}. It is saved with your name and the date.</div></li>'
            f'<li><div>Reviews cannot be edited. To remove one, click {ui("Delete")} and confirm. It is hidden from the log but kept on the ATC.</div></li>'
            f'<li><div>Tick {ui("Show deleted")} to see deleted reviews; {ui("Undelete")} brings one back.</div></li>'
            '<li><div>When you edit the ATC, the whole log moves to the new version.</div></li></ol>')
        add(fig('ei-view-review-typing', 'Writing a review.'))
        add(pair(fig('ei-view-review-delete-confirm', 'Delete asks for confirmation.'),
                 fig('ei-view-review-show-deleted', 'Show deleted reveals the deleted review.')))
        add('</section>')

    # ---- edit
    n = '07' if not W else '06'
    add(f'<section id="edit"><h2><span class="num">{n}</span>Edit an ATC</h2>')
    add(f'<p class="lede">{b("Edit ATC")} opens <span class="ui">Edit prescribed ATC</span> in a new tab. The {"WiSH outcomes" if W else "Ask list"} can be changed like everything else, with the same rules as Prescribe.</p>')
    add(fig(f'{pre}-edit-top', f'Editing {participant}’s {name} ATC.'))
    add(f'<p>Saving never overwrites: {b("Review and update")} shows a preview, and submitting it creates a new version. The previous version is kept and hidden from the participant, and forms already filled{" and the Review log" if not W else ""} carry over.' + (' Procedures newly picked on a WiSH ATC are ticked Mandatory; saved procedures keep their setting.' if W else '') + '</p>')
    add(fig(f'{pre}-edit-panel', 'The right panel says which version saving creates.' + ('' if W else ' EI Solution also says how many reviews carry over.'), 'narrow'))
    add('</section>')

    # ---- app
    n = '08' if not W else '07'
    add(f'<section id="app"><h2><span class="num">{n}</span>What the participant sees</h2>')
    add(f'<p class="lede">The participant uses the Breakthroughs app. They see the ATC once it is validated (or sent without validation), and any form you send arrives on their home screen.</p>')
    add('<h3>Forms to fill</h3>')
    add(f'<p>Sent forms appear under <span class="ui">Forms to fill</span> on the home screen, with the model and the date it was sent. Tapping one opens <span class="ui">Fill Form</span>. The answers save as a draft while they type; <span class="ui">Preview</span> then <span class="ui">Confirm &amp; Submit</span> sends it, and the card disappears.</p>')
    w = 'asha'
    if W:
        add(phones([(f'{w}-02-forms-to-fill', 'The Life Report waiting on the home screen.'), (f'{w}-03-fill-form', 'Fill Form.'),
                    (f'{w}-04-fill-form-typed', 'Answering. “Draft Saved” shows at the top.'), (f'{w}-05-preview', 'Review Your Submission, then Confirm &amp; Submit.'), (f'{w}-06-after-submit', 'After submitting, the card is gone.')]))
    else:
        add(phones([('rahul-02-forms-to-fill', 'After Ask to update the card says “Your specialist asked you to fill this again”.'),
                    ('rahul-03-fill-form', 'The form opens with the previous answers, ready to change.'),
                    ('rahul-05-preview', 'Review Your Submission.')]))
    add(note('tip', 'If the form was withdrawn', '<p>If you withdraw a form while the participant has it open, the app tells them their specialist withdrew it and they cannot submit.</p>'))
    add('<h3>My ATC</h3>')
    who = 'asha' if W else 'rahul'
    add(f'<p>The participant opens the <span class="ui">My Journey</span> tab and taps <span class="ui">View All ATC</span>. Each ATC shows the model image, the specialists, the directive and the adjustment progress. <span class="ui">View Full ATC</span> opens the {"WiSH outcomes" if W else "Ask · area of focus"} and the adjustments with their procedures.</p>')
    add(phones([(f'{who}-07-my-journey-atc', 'My ATC on the My Journey tab.'), (f'{who}-08-my-atc', f'The {name} ATC card.'),
                (f'{who}-09-full-atc', f'{"WiSH outcomes" if W else "Ask · area of focus"} in the full ATC.'),
                (f'{who}-10-full-atc-adjustments', 'Adjustments and procedures.')]))
    if not W:
        add(note('', 'Private by design', '<p>The Review log never appears in the app, on any screen.</p>'))
    add('</section>')

    # ---- faq
    n = '09' if not W else '08'
    add(f'<section id="faq"><h2><span class="num">{n}</span>Troubleshooting</h2>')
    faqs = [
        (f'The {name} sections don’t appear in Prescribe ATC',
         f'<p>The model name must be <code>{name}</code> (any case). Check the name in ATC Model; a different spelling gives a regular ATC.</p>'),
        ('The specialists were not filled in',
         f'<p>You must be a host of the participant’s {appt} appointment, it must have started and not be cancelled, and the mapping must have “An ATC is given in this appointment” ticked with the model {name}. Fill the specialists by hand and ask your administrator to check setup step 4.</p>'),
        ('There is no Forms card on the ATC',
         f'<p>The card appears only on validated ATCs that the participant can see, and only if the {name} model has forms. Validate the ATC first, and check the Forms section of the model.</p>'),
        ('A form is missing from “Add a form”', '<p>Deleted forms are not offered. Restore it in Delivery Activities.</p>'),
        ('The participant says the form isn’t in the app',
         '<p>Check the row in the Forms card. “Not sent” means it was never sent; send it. If it was withdrawn, send it again.</p>'),
    ]
    if W:
        faqs.insert(2, ('Submit says a Changework brief is required',
                        '<p>Every WiSH procedure is mandatory, and a mandatory procedure needs a Changework brief. Record or upload the brief in the Changework Brief section.</p>'))
    else:
        faqs.insert(2, ('Can I edit or remove a review?',
                        '<p>Reviews can’t be edited. Delete hides one from the log (it stays on the ATC) and Undelete brings it back.</p>'))
    for q, a in faqs:
        add(f'<details><summary>{q}</summary>{a}</details>')
    add('</section>')
    add(f'<footer>StarLabs · {name} ATC manual · Written for the release on the <code>atc-development</code> branch, 30 October 2026. Screenshots use fictional demo data on a test system.</footer>')
    add('</main></div>')
    return '\n'.join(P)


for key, fname in (('wish', 'wish-atc-manual.html'), ('ei', 'ei-solution-atc-manual.html')):
    html = page(key)
    with open(os.path.join(SITE, fname), 'w') as f:
        f.write(html)
    with open(os.path.join(SITE, f'{key}-images.txt'), 'w') as f:
        f.write('\n'.join(sorted(USED[key])))
    print(fname, len(html), 'chars,', len(USED[key]), 'images', html.count('<!-- missing'), 'missing')
