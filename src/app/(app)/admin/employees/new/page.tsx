import NewEmployeeForm from "./NewEmployeeForm";

export default function NewEmployeePage() {
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Add Employee</h1>
      <NewEmployeeForm />
    </div>
  );
}
