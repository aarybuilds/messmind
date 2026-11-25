export default function PageTitle({ kicker, title }) {
  return (
    <div>
      {kicker && <p className="page-kicker">{kicker}</p>}
      <h1>{title}</h1>
      <div className="title-bar">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  )
}
