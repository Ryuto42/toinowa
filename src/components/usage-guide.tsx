import Link from 'next/link';
import { PageTitle, Panel } from '@/components/dashboard';
import { GuideToc } from '@/components/guide-toc';
import { GuideShot } from '@/components/guide-shot';

type Role = 'teacher' | 'student' | 'admin';
type Step = { title: string; body: string; href?: string; action?: string; image?: string; caption?: string };

/** 画面写真の撮り直しは `npm run guide:capture`（scripts/capture-guide.ts）。 */

const steps: Record<Role, Step[]> = {
  teacher: [
    {
      title: '1. 授業で教えたことを渡す',
      body: '「課題」の右上「新しく作成」を押します。渡す相手（生徒ごと／クラス一括）と期限を選び、授業メモを書くか、授業資料のPDF・写真を選びます。両方でも大丈夫です。「AIに準備を任せる」を押すと、対象の生徒それぞれに課題と学習計画を準備します。上のステップ表示が2に進んだら受付完了です。画面を閉じても準備は続きます。',
      href: '/teacher/assignments', action: '課題を開く',
      image: 'teacher-create',
      caption: '「新しく作成」で開く画面。お題を自分で書きたいときは、一番下の「手動で設定する」を開きます。',
    },
    {
      title: '2. 課題案を確認して配信する',
      body: '準備ができると「先生の確認待ち」にカードが並びます。お題の文面・対象・期限を確認し、必要なら鉛筆アイコンから直します。よければカード右の「確認して配信」を押すと、その1件だけが生徒に届きます。取り下げたいときはゴミ箱アイコンです。配信するまで生徒には表示されません。',
      href: '/teacher/assignments', action: '課題案を確認する',
      image: 'teacher-assignments',
      caption: '期限が未設定の課題は配信できません。鉛筆アイコンから設定してください。',
    },
    {
      title: '3. 説明の結果と、次の提案を見る',
      body: '生徒が対話を終えると、AIが説明を分析します。「生徒」から対象の生徒を開くと、理解度・観点別の強み弱み・繰り返すつまずき・提出ごとの根拠が見られます。提出ごとの分析には、その説明が本人の言葉で書かれたと考えられるかの手がかり（話したときの言いよどみ、書く速さ、文体）も添えています。次回の課題案も自動で準備されますが、配信するかどうかは先生が決めます。',
      href: '/teacher/students', action: '生徒の理解と計画を見る',
      image: 'teacher-students',
      caption: '一覧は検索・絞り込み・並べ替えができます。氏名を押すとその生徒の記録が開きます。',
    },
    {
      title: '4. 気になる生徒に気づく',
      body: '「要フォロー」には、安全上の懸念・生成AIの疑い・繰り返すつまずき・学習停滞をAIが自動でまとめます。根拠を開いて確認し、問題なければ「問題なし」を押します。判断は先生が行うもので、自動判定は手がかりにすぎません。',
      href: '/teacher/interventions', action: '要フォローを見る',
      image: 'teacher-followups',
    },
    {
      title: '5. 担当が変わるときは引き継ぐ',
      body: '担当替えや代講のときは、生徒のページから「別の先生へ引き継ぐ」を押します。その時点の理解度・つまずき・要フォローの項目が申し送りに添えられ、相手が引き受けると記録に残ります。',
      href: '/teacher/handoffs', action: '引き継ぎを見る',
      image: 'teacher-handoffs',
    },
  ],
  student: [
    {
      title: 'まずは今日やることを見る',
      body: '「今日の学習」に、先生から届いた課題と、次の復習が並びます。まだ課題がないときは、先生の配信を待ちましょう。',
      href: '/student/home', action: '今日の学習を開く',
      image: 'student-home',
    },
    {
      title: '1. 今日のお題を開く',
      body: '「課題」で課題を開きます。未着手・進行中・完了が一目で分かります。何を説明するかと期限を確認してから始めましょう。',
      href: '/student/study', action: '課題を開く',
      image: 'student-study',
    },
    {
      title: '2. AIに、自分の言葉で教える',
      body: 'AIは、あなたの説明を聞く相手です。用語の意味、なぜそうなるか、身近な例を使って説明してみましょう。AIから質問されたら、言い直したり例を変えたりして大丈夫です。わからないときは「ここがわからない」と伝えてください。書くより話すほうが説明しやすいときは、入力欄の右にある緑のマイクを押すと、話した内容がその場で会話に書き起こされます。もう一度押して録音を止めたら、入力欄の文字を確認・修正して「送信」を押してください。送信を間違えたときは「↩ 直前の送信を取り消す」で1つ前に戻せます。',
    },
    {
      title: '3. 対話が終わったら振り返る',
      body: '対話が終わり、分析が完了すると、よかった点と次に意識することが届きます。説明し直せたことも大切な前進です。次のお題は先生が配信します。',
      href: '/student/records', action: 'フィードバックを見る',
      image: 'student-records',
    },
  ],
  admin: [
    {
      title: '1. 先生を登録する',
      body: 'ユーザー管理の右上「ユーザーを追加する」から先生を登録し、初期パスワードを渡します。個別指導ではクラスの作成は不要です。集合授業で使う場合だけクラス管理でクラスを作成します。',
      href: '/admin/users', action: 'ユーザー管理を開く',
      image: 'admin-user-create',
      caption: 'クラスを選ばない場合は、この生徒だけの「個別指導」クラスを作り、担当の先生をここで決めます。',
    },
    {
      title: '2. 生徒を登録し、ログイン情報を渡す',
      body: 'ログインIDは所属ごとに student1、student2… と自動発行します。生徒のメールアドレスは不要です。登録後のポップアップで所属コード・ログインID・初期パスワードをコピーし、本人へ伝えてください。全ロールで初回ログイン後にパスワード変更が必要です。',
      href: '/admin/users', action: '登録済みユーザーを見る',
      image: 'admin-users',
      caption: '氏名の右の鉛筆アイコンから、登録情報・担当の先生・パスワード再発行をまとめて変更できます。',
    },
    {
      title: '3. 学習状況を確認する',
      body: '「生徒」では、学校のすべての生徒の担当・提出状況・理解度を一覧で見られます。担当が未設定の生徒は赤字で出ます。担当がいないと、どの先生の一覧にも表示されません。',
      href: '/admin/students', action: '生徒を見る',
      image: 'admin-students',
    },
    {
      title: '4. AIの利用と費用を管理する',
      body: 'AI利用状況では、モデルの稼働・本日の予算・利用者別の費用を確認できます。モデルの一時停止もここから行えます。音声入力はOrcaRouterが費用を返さないことがあるため、カタログ単価からの推定値を合算しています。対話などには代替処理があります。模試の分析は誤った結果で埋めず、再試行で復旧できなければ再アップロードや手入力で進めます。',
      href: '/admin/usage', action: 'AI利用状況を見る',
      image: 'admin-usage',
    },
  ],
};

const questions: Record<Role, Array<[string, string]>> = {
  teacher: [
    ['授業メモには何を書けばよいですか？', '教えたテーマ、扱った例、まだ教えていない範囲を書くと、範囲に合った課題を準備しやすくなります。生徒全員分の問題文や評価基準を書く必要はありません。'],
    ['資料の読み取り中に画面を閉じてもよいですか？', '授業資料の読み取りが終わるまでは、その画面を開いておいてください。その後「AIに準備を任せる」を押し、ステップが2に進めば、画面を離れても生徒別の準備は続きます。'],
    ['計画ができたら、全部の課題が配信されますか？', '配信されません。計画からまず一つの課題案を準備します。先生が「確認して配信」を押した課題だけが届きます。'],
    ['自分でテーマや問題文を指定できますか？', '「新しく作成」の一番下にある「手動で設定する」を開いてください。お題を書いて「お題をもとに作成」を押すと、確認待ちに入ります。相手と期限は上で選んだものを使います。'],
    ['課題を間違えて作ってしまいました。', 'カードのゴミ箱アイコンから取り下げられます。一覧から消えて生徒にも表示されなくなりますが、提出済みの説明や評価は残ります。'],
    ['生成AIで書かせたものか分かりますか？', '断定はできません。提出ごとの分析に、疑わしいと考えた理由と、本人が説明したと考えられる特徴の両方を並べています。疑いが強いものは要フォローに上がります。手がかりとして読み、最終的な判断は先生が行ってください。'],
    ['AIの評価が違うと感じたら？', '生徒の提出ごとの分析で根拠を確認し、必要に応じて評価を修正してください。先生の修正を次の計画に反映します。一度の説明だけで学力全体を断定するものではありません。'],
    ['準備が止まった・一部だけ失敗した場合は？', '「AIの準備状況」を確認してください。一時的な障害は自動で再試行します。失敗が確定した生徒分は「失敗した生徒分を再試行」から再開できます。成功済みの課題は残ります。'],
  ],
  student: [
    ['何を説明すればよいかわかりません。', 'まずお題の言葉の意味を、知っている範囲で説明してみましょう。「この言葉がわからない」とAIに伝えることもできます。長い文章を書くことが目的ではありません。'],
    ['声で説明できますか？', '入力欄の右にある緑のマイクを押すと録音が始まり、話した内容がその場で会話に書き起こされます。もう一度押して録音を止めたら、入力欄の文字を確認・修正してから「送信」を押してください。うまく聞き取れないときは、静かな場所で少しゆっくり話してみてください。'],
    ['送信を間違えました。', 'チャットの「↩ 直前の送信を取り消す」で1つ前に戻せます。戻せるのは直前の1回だけです。'],
    ['入力欄を見ながら過去の会話を読みたいです。', '会話の部分だけを上下にスクロールできます。入力欄と送信ボタンは画面下に残ります。'],
    ['途中でフィードバックを見られません。', '説明の途中では表示されません。対話が終了してから分析するため、完了後も少し待つことがあります。'],
    ['パスワードを忘れました。', '先生または管理者に連絡してください。新しい初期パスワードを受け取ったらログインし、自分のパスワードに変更します。'],
  ],
  admin: [
    ['生徒やクラスの利用を終了するには？', '生徒はユーザーの編集画面、クラスはクラス管理の一覧からアーカイブできます。履歴を残して停止し、後から復元できます。アーカイブ済みを表示すると完全削除も選べます。'],
    ['模試や学習目標がまだありません。', 'なくても登録できます。必須の印がある項目だけ入力してください。目標や時間のAI提案は、本人が決めた希望とは区別して確認してください。'],
    ['どのファイルを読み取れますか？', 'PDFは8ページ以内、写真はJPEG・PNG・WebP、ファイルは15MB以内です。大きな資料は分けてください。不要な氏名や連絡先は除き、画像が鮮明か確認してください。'],
    ['模試が「確認が必要」になりました。', 'ユーザー管理の「模試の分析状況」から確認画面を開いてください。元資料と読み取り候補を見比べ、必要な箇所を修正して承認します。承認前は生徒情報へ反映しません。確認中の原画像は承認後に削除します。'],
    ['初期パスワードの画面を閉じてしまいました。', '保存済みのパスワードを再表示することはできません。ユーザーの編集画面からリセットし、新しく発行した情報を本人へ伝えてください。'],
    ['先生の画面は見られますか？', '見られません。管理者には管理者の画面だけが表示されます。生徒の学習状況・提出状況・要フォロー・引き継ぎは、すべて管理者側の画面から確認できます。'],
    ['AIが止まってしまいました。', 'AI利用状況で本日の予算と、モデルが一時停止になっていないかを確認してください。予算上限に達すると呼び出しが止まります。'],
  ],
};

function slug(index: number) { return `guide-${index}`; }

export function UsageGuide({ role }: { role: Role }) {
  const label = { teacher: '先生', student: '生徒', admin: '管理者' }[role];
  const sections = [
    ...steps[role].map((step, index) => ({ id: slug(index), label: step.title })),
    ...(role === 'teacher' ? [{ id: 'guide-sample', label: '最初の一回：こんな授業メモで試せます' }] : []),
    { id: 'guide-faq', label: '困ったときは' },
  ];

  return <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
    <div className="space-y-7">
    <PageTitle title={`${label}の使い方ガイド`}
      description={role === 'student' ? 'AIに教えることで、自分の理解を確かめよう。' : '授業で教えたことを、生徒が自分の言葉で説明できる理解へつなげます。'} />
    {steps[role].map((step, index) => <section key={step.title} id={slug(index)} className="scroll-mt-24"><Panel title={step.title}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-7">
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-7 text-slate-600">{step.body}</p>
          {step.href ? <Link href={step.href} className="mt-4 inline-block rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">{step.action}</Link> : null}
        </div>
        {step.image ? <GuideShot src={step.image} alt={`${step.title}の画面`} caption={step.caption} /> : null}
      </div>
    </Panel></section>)}
    {role === 'teacher' ? <section id="guide-sample" className="scroll-mt-24"><Panel title="最初の一回：こんな授業メモで試せます">
      <blockquote className="rounded-xl bg-slate-50 p-4 text-sm leading-8">
        今日は一次関数の傾きと切片を学習。式からグラフを描く練習をした。傾きが「横に1進むときの縦の変化」であることを説明した。文章題はまだ扱っていない。
      </blockquote>
      <p className="mt-4 text-sm leading-7 text-slate-600">
        これをもとに、AIが生徒の模試・過去の説明を参考に課題案を作ります。例えば、意味の説明が曖昧な生徒には意味を、基本を説明できる生徒には具体例とのつながりを問いかける案を準備します。
      </p>
    </Panel></section> : null}
    <section id="guide-faq" className="scroll-mt-24"><Panel title="困ったときは">
      <div className="divide-y divide-slate-100">
        {questions[role].map(([question, answer]) => <details key={question} className="py-4 first:pt-0">
          <summary className="cursor-pointer text-sm font-bold">{question}</summary>
          <p className="mt-3 text-sm leading-8 text-slate-600">{answer}</p>
        </details>)}
      </div>
    </Panel></section>
    </div>
    <aside className="hidden lg:block"><GuideToc items={sections} /></aside>
  </div>;
}
