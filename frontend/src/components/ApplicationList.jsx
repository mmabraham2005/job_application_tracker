import ApplicationRow from './ApplicationRow'

function ApplicationList({ applications, onStatusChange, onEdit, onDelete }) {
  return (
    <table className="application-table">
      <thead>
        <tr>
          <th>Company</th>
          <th>Job title</th>
          <th>Date applied</th>
          <th>Status</th>
          <th aria-label="Actions"></th>
        </tr>
      </thead>
      <tbody>
        {applications.map((application) => (
          <ApplicationRow
            key={application._id}
            application={application}
            onStatusChange={onStatusChange}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  )
}

export default ApplicationList
