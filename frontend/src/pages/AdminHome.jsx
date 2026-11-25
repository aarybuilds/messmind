import PageTitle from '../components/PageTitle'

export default function AdminHome() {
  return (
    <>
      <PageTitle kicker="Admin" title="Overview" />
      <p className="muted">Forecast accuracy and wastage trends will appear here.</p>
    </>
  )
}
